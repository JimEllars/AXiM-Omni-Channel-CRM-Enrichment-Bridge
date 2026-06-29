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
        ctx.waitUntil(processInBatches(env, source, records, ctx));

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
      await logTelemetry(env, 'CRON RUN', 'INFO', 'Nightly sync executed');
    } catch (error) {
      console.error('Cron job error:', error);
    }
  }
};

// --- PIPELINE HANDLERS ---

async function processInBatches(env, source, rawRecords, ctx) {
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
        await processAndDispatch(env, source, cleanRecords, ctx);
        successCount = cleanRecords.length;
      }

      await logTelemetry(env, 'BATCH_SUMMARY', 'INFO', `[BATCH IMPORT] Processed: ${chunk.length} | Success: ${successCount} | Enrichment Fails: ${enrichmentFailCount}`);
    } catch (error) {
      await logTelemetry(env, 'BATCH_PROCESS_FAULT', 'HIGH', `Error in batch ${i / BATCH_SIZE}: ${error.message}`);
    }
  }
}

async function processAndDispatch(env, source, records, ctx) {
  try {
     // A. Deduplication Check (Using Cloudflare KV)
     const uniqueRecords = [];
     for (const record of records) {
         if (env.LEAD_KV && record.email) {
           const emailKey = record.email.toLowerCase().trim();
           const isDuplicate = await env.LEAD_KV.get(`lead:${emailKey}`);
           if (isDuplicate) {
               await logTelemetry(env, 'DUPLICATE_CAUGHT', 'INFO', `Duplicate record caught for email: ${emailKey}`);
           } else {
               uniqueRecords.push(record);
           }
         } else {
           uniqueRecords.push(record);
         }
     }

     if (uniqueRecords.length === 0) return;

     // B. Multiplex Dispatch

     // Fetch URLs
     let albatoWebhookUrl = env.ALBATO_WEBHOOK_URL || 'https://h.albato.com/wh/placeholder';
     let coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com/v1/bulk/ingest';
     if (env.LEAD_KV) {
       const kvUrl = await env.LEAD_KV.get('config:egress_url');
       if (kvUrl) {
         try {
           albatoWebhookUrl = JSON.parse(kvUrl);
         } catch {
           albatoWebhookUrl = kvUrl;
         }
       }
       const coreUrl = await env.LEAD_KV.get('config:core_rest_url');
       if (coreUrl) {
         try {
           coreRestUrl = JSON.parse(coreUrl);
         } catch {
           coreRestUrl = coreUrl;
         }
       }
     }

     // Align CRM Schema for Deskera
     const mappedRecords = formatForDeskera(uniqueRecords);

     const validRecords = [];
     const invalidRecords = [];

     for (const record of mappedRecords) {
         if (record._is_invalid) {
             invalidRecords.push(record);
         } else {
             validRecords.push(record);
         }
     }

     if (invalidRecords.length > 0) {
         await logToRecovery(env, source, "Pre-Flight Validation Failed", {
             destination: 'DLQ',
             original: uniqueRecords.filter((_, i) => mappedRecords[i]._is_invalid),
             mapped: invalidRecords
         });
         await logTelemetry(env, 'PRE_FLIGHT_VALIDATION_FAILED', 'HIGH', `${invalidRecords.length} records failed pre-flight validation.`);
     }

     if (validRecords.length === 0) return;

     const dispatchPayload = {
         metadata: { source: source, processed_at: new Date().toISOString() },
         data: validRecords
     };

     let albatoSuccess = false;
     let coreSuccess = false;

     // 1. Dispatch to Albato (Sales CRM)
     try {
       const albatoRes = await fetch(albatoWebhookUrl, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(dispatchPayload)
       });

       if (!albatoRes.ok) {
           await logToRecovery(env, source, "Albato 500/Rejection", {
             destination: 'Albato',
             original: uniqueRecords,
             mapped: dispatchPayload
           });
           await logTelemetry(env, 'EGRESS_FAULT_ALBATO', 'HIGH', `Albato rejection: ${albatoRes.status}`);
       } else {
           albatoSuccess = true;
           await logTelemetry(env, 'SYNC_SUCCESS_ALBATO', 'INFO', `Successfully synced ${uniqueRecords.length} records to Albato`);
       }
     } catch (e) {
         await logToRecovery(env, source, "Albato Network Error", {
             destination: 'Albato',
             original: uniqueRecords,
             mapped: dispatchPayload
         });
         await logTelemetry(env, 'EGRESS_FAULT_ALBATO', 'HIGH', `Albato dispatch failed: ${e.message}`);
     }

     // 2. Dispatch to AXiM Core (Bulk Volume)
     try {
       const coreRes = await fetch(coreRestUrl, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}` },
           body: JSON.stringify(dispatchPayload)
       });

       if (!coreRes.ok) {
           await logToRecovery(env, source, "Core 500/Rejection", {
             destination: 'Core',
             original: uniqueRecords,
             mapped: dispatchPayload
           });
           await logTelemetry(env, 'EGRESS_FAULT_CORE', 'HIGH', `Core rejection: ${coreRes.status}`);
       } else {
           coreSuccess = true;
           await logTelemetry(env, 'SYNC_SUCCESS_CORE', 'INFO', `Successfully synced ${uniqueRecords.length} records to AXiM Core`);
       }
     } catch (e) {
         await logToRecovery(env, source, "Core Network Error", {
             destination: 'Core',
             original: uniqueRecords,
             mapped: dispatchPayload
         });
         await logTelemetry(env, 'EGRESS_FAULT_CORE', 'HIGH', `Core dispatch failed: ${e.message}`);
     }

     // Only save to KV after 200 OK from either destination
     if (env.LEAD_KV && (albatoSuccess || coreSuccess)) {
         for (const record of uniqueRecords) {
             if (record.email) {
                 const emailKey = record.email.toLowerCase().trim();
                 // waitUntil allows fire and forget for KV put
                 if (ctx && ctx.waitUntil) {
                     ctx.waitUntil(env.LEAD_KV.put(`lead:${emailKey}`, "true", { expirationTtl: 2592000 }));
                 } else {
                     await env.LEAD_KV.put(`lead:${emailKey}`, "true", { expirationTtl: 2592000 });
                 }
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
      // pass undefined/null for ctx since it's cron, fallback handles it
      await processInBatches(env, 'scheduled_sweep', sweepBatches, null);
    }

    await logTelemetry(env, 'SWEEP_COMPLETE', 'INFO', `Completed database sweep. Processed ${mockSweepData.length} records.`);
  } catch (error) {
    await logTelemetry(env, 'SWEEP_FAULT', 'HIGH', `Error during database sweep: ${error.message}`);
  }
}
