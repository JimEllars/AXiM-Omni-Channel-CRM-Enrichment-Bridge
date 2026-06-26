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
  }
};

// --- PIPELINE HANDLERS ---

async function processInBatches(env, source, rawRecords) {
  const BATCH_SIZE = 50;

  for (let i = 0; i < rawRecords.length; i += BATCH_SIZE) {
    const chunk = rawRecords.slice(i, i + BATCH_SIZE);

    try {
      const cleanRecords = [];

      for (const record of chunk) {
        const sanitized = sanitizeLeadData(record);
        if (sanitized.isValid) {
          const enriched = await enrichRecord(sanitized);
          cleanRecords.push(enriched);
        }
      }

      if (cleanRecords.length > 0) {
        await processAndDispatch(env, source, cleanRecords);
      }
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
           if (!isDuplicate) {
               uniqueRecords.push(record);
               await env.LEAD_KV.put(`lead:${record.email}`, "true", { expirationTtl: 2592000 }); 
           }
         } else {
           uniqueRecords.push(record);
         }
     }

     if (uniqueRecords.length === 0) return;

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
         data: uniqueRecords
     };

     const albatoRes = await fetch(webhookUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(albatoPayload)
     });

     if (!albatoRes.ok) {
         await logToRecovery(env, source, "Albato 500/Rejection", albatoPayload);
         throw new Error(`Albato rejection: ${albatoRes.status}`);
     }

     // C. Log Success to AXiM Core
     await logTelemetry(env, 'SYNC_SUCCESS', 'INFO', `Successfully pushed ${uniqueRecords.length} leads to CRM.`);

  } catch (error) {
     await logTelemetry(env, 'DISPATCH_FAULT', 'CRITICAL', error.message);
  }
}
