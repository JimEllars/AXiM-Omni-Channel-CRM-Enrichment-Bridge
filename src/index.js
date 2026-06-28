import { formatForDeskera } from './utils/mapper.js';
import { sanitizeLeadData } from './utils/sanitize.js';
import { logTelemetry } from './utils/telemetry.js';
import { logToRecovery } from './utils/workerSheets.js';
import { enrichRecord } from './utils/enrichmentLogic.js';

/**
 * Cloudflare Worker Entry Point
 * Omni-Channel CRM Enrichment Bridge
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/v1/management/sync' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const { workerSheetsRequest } = await import('./utils/workerSheets.js');
        const data = await workerSheetsRequest(env, '/values/Config!A:B');

        let count = 0;
        if (data.values && env.LEAD_KV) {
          for (const row of data.values) {
             const key = row[0];
             const val = row[1];
             if (key && val) {
               await env.LEAD_KV.put(`config:${key}`, val);
               count++;
             }
          }
        }

        return new Response(JSON.stringify({ status: 'Synced', count }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        ctx.waitUntil(logTelemetry(env, 'SYNC_FAULT', 'HIGH', error.message));
        return new Response('Sync Error', { status: 500 });
      }
    }

    // INGRESS: Webhook Catcher Endpoint
    if (url.pathname === '/v1/webhooks/enrich' && request.method === 'POST') {
      try {
        // Authenticate incoming traffic using internal AXiM service key
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const rawPayload = await request.json();
        const source = rawPayload.source || 'api';
        
        // Single object or array support
        let records = [];
        if (Array.isArray(rawPayload.records)) {
          records = rawPayload.records;
        } else if (rawPayload.record) {
          records = [rawPayload.record];
        } else if (Array.isArray(rawPayload)) {
          records = rawPayload;
        } else {
          return new Response('Invalid Payload Format: Expected records array or single record', { status: 400 });
        }

        if (records.length === 0) {
           return new Response(JSON.stringify({ message: 'No records provided.' }), {
             status: 200,
             headers: { 'Content-Type': 'application/json' }
           });
        }

        // Out-of-band Processing via ctx.waitUntil
        // Processes array in small chunks (e.g. 50 records at a time) through sanitize and enrich
        ctx.waitUntil(processInBatches(env, source, records));

        return new Response(JSON.stringify({ status: 'Accepted', processing_count: records.length }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        ctx.waitUntil(logTelemetry(env, 'INGRESS_FAULT', 'HIGH', error.message));
        return new Response('Internal Pipeline Error', { status: 500 });
      }
    }

    return new Response('Endpoint Not Found', { status: 404 });
  },

  // SCHEDULED: Cron Trigger Handler for Database Sweeps
  async scheduled(event, env, ctx) {
    try {
      if (env.LEAD_KV) {
        const config = await env.LEAD_KV.get('config:cron_config') || 'default_config';
        const { logToSheets } = await import('./utils/workerSheets.js');
        await logToSheets(env, '[CRON RUN]', 'INFO', `Nightly sync executed with config: ${config}`);
      }
    } catch (error) {
      console.error('Cron job error:', error);
    }
    ctx.waitUntil(performDatabaseSweep(env));
  }
};

// --- PIPELINE HANDLERS ---

async function processInBatches(env, source, rawRecords) {
  const BATCH_SIZE = 50;

  for (let i = 0; i < rawRecords.length; i += BATCH_SIZE) {
    const chunk = rawRecords.slice(i, i + BATCH_SIZE);
    let successCount = 0;
    let enrichmentFailCount = 0;

    try {
      const cleanRecords = [];

      for (const record of chunk) {
        const sanitized = sanitizeLeadData(record);
        if (sanitized.isValid) {
          const enriched = await enrichRecord(env, sanitized);
          if (enriched._enrichment_failed) {
            enrichmentFailCount++;
          }
          cleanRecords.push(enriched);
        }
      }

      if (cleanRecords.length > 0) {
        await processAndDispatch(env, source, cleanRecords);
        successCount = cleanRecords.length;
      }

      await logTelemetry(env, 'SYNC_SUCCESS', 'INFO', `[BATCH IMPORT] Processed: ${chunk.length} | Success: ${successCount} | Enrichment Fails: ${enrichmentFailCount}`);
    } catch (error) {
      await logTelemetry(env, 'BATCH_PROCESS_FAULT', 'HIGH', `Error in batch ${i / BATCH_SIZE}: ${error.message}`);
    }
  }
}

async function processAndDispatch(env, source, records) {
  try {
     // A. Deduplication Check (Using Cloudflare KV)
     const uniqueRecords = [];
     for (const record of records) {
         if (env.LEAD_KV) {
           const isDuplicate = await env.LEAD_KV.get(`lead:${record.email}`);
           if (isDuplicate) {
               await logTelemetry(env, 'DUPLICATE_CAUGHT', 'INFO', `Duplicate record caught for email: ${record.email}`);
           } else {
               uniqueRecords.push(record);
               // We don't save to KV here. We wait for 200 OK from Albato.
           }
         } else {
           uniqueRecords.push(record);
         }
     }


     if (uniqueRecords.length === 0) return;

     // Align CRM Schema for Deskera
     const deskeraRecords = formatForDeskera(uniqueRecords);

     // B. Dispatch to Albato

     let webhookUrl = env.ALBATO_WEBHOOK_URL || 'https://h.albato.com/wh/placeholder';
     if (env.LEAD_KV) {
       const kvUrl = await env.LEAD_KV.get('config:egress_url');
       if (kvUrl) {
         try {
           webhookUrl = JSON.parse(kvUrl);
         } catch {
           webhookUrl = kvUrl;
         }
       }
     }

     const albatoPayload = {
         metadata: { source: source, processed_at: new Date().toISOString() },
         data: deskeraRecords
     };

     const albatoRes = await fetch(webhookUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(albatoPayload)
     });

     if (!albatoRes.ok) {
         // Include both uniqueRecords (original sanitized) and albatoPayload (mapped)
         await logToRecovery(env, source, "Albato 500/Rejection", {
           original: uniqueRecords,
           mapped: albatoPayload
         });
         throw new Error(`Albato rejection: ${albatoRes.status}`);
     } else {
         // Only save to KV after 200 OK
         if (env.LEAD_KV) {
             for (const record of uniqueRecords) {
                 await env.LEAD_KV.put(`lead:${record.email}`, "true", { expirationTtl: 2592000 });
             }
         }
     }

  } catch (error) {
     await logTelemetry(env, 'DISPATCH_FAULT', 'CRITICAL', error.message);
  }
}


// --- SCHEDULED HANDLERS ---
async function performDatabaseSweep(env) {
  try {
    await logTelemetry(env, 'SWEEP_START', 'INFO', 'Starting nightly database sweep for enrichment.');

    // Placeholder for actual database sweep logic
    // In a real implementation, this would query KV (or another DB) for leads:
    // 1. Tagged with needs_enrichment: true
    // 2. Older than 90 days

    const mockSweepData = [
      { email: 'stale1@example.com', name: 'Stale Lead', needs_enrichment: true },
      { email: 'stale2@example.com', name: 'Old Lead' } // Mocking > 90 days old
    ];

    // Route them back through the enrichment logic
    const sweepBatches = mockSweepData.map(record => sanitizeLeadData(record))
                                      .filter(sanitized => sanitized.isValid);

    if (sweepBatches.length > 0) {
      await processInBatches(env, 'scheduled_sweep', sweepBatches);
    }

    await logTelemetry(env, 'SWEEP_COMPLETE', 'INFO', `Completed database sweep. Processed ${mockSweepData.length} records.`);
  } catch (error) {
    await logTelemetry(env, 'SWEEP_FAULT', 'HIGH', `Error during database sweep: ${error.message}`);
  }
}
