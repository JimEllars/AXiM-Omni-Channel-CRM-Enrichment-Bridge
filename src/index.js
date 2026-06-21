import { sanitizeLeadData } from './utils/sanitize.js';
import { logTelemetry } from './utils/telemetry.js';

/**
 * Cloudflare Worker Entry Point
 * Omni-Channel CRM Enrichment Bridge
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // INGRESS: Webhook Catcher Endpoint
    if (url.pathname === '/v1/webhooks/enrich' && request.method === 'POST') {
      try {
        // Authenticate incoming traffic using internal AXiM service key
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const rawPayload = await request.json();
        
        // 1. Data Validation & Sanitization
        const { source, records } = rawPayload;
        if (!records || !Array.isArray(records)) {
            return new Response('Invalid Payload Format', { status: 400 });
        }
        
        const cleanRecords = records.map(sanitizeLeadData).filter(r => r.isValid);

        if (cleanRecords.length === 0) {
           return new Response(JSON.stringify({ message: 'No valid records found post-sanitization.' }), { 
             status: 200,
             headers: { 'Content-Type': 'application/json' }
           });
        }

        // 2. Out-of-band Processing via ctx.waitUntil
        // This ensures the scraper gets an immediate 202 Accepted without waiting for the Albato/CRM sync
        ctx.waitUntil(processAndDispatch(env, source, cleanRecords));

        return new Response(JSON.stringify({ status: 'Accepted', processing_count: cleanRecords.length }), { 
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

async function processAndDispatch(env, source, records) {
  try {
     // A. Deduplication Check (Using Cloudflare KV)
     // Generate a hash pattern of the emails to prevent duplicate pushes
     const uniqueRecords = [];
     for (const record of records) {
         // In production env.LEAD_KV will be bound. Mock fallback for local testing if unbound.
         if (env.LEAD_KV) {
           const isDuplicate = await env.LEAD_KV.get(`lead:${record.email}`);
           if (!isDuplicate) {
               uniqueRecords.push(record);
               // Lock for 30 days to prevent future duplicate scrapes
               await env.LEAD_KV.put(`lead:${record.email}`, "true", { expirationTtl: 2592000 }); 
           }
         } else {
           uniqueRecords.push(record); // Fallback if KV is unconfigured
         }
     }

     if (uniqueRecords.length === 0) return;

     // B. Dispatch to Albato
     const albatoPayload = {
         metadata: { source: source, processed_at: new Date().toISOString() },
         data: uniqueRecords
     };

     const albatoRes = await fetch(env.ALBATO_WEBHOOK_URL, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(albatoPayload)
     });

     if (!albatoRes.ok) throw new Error(`Albato rejection: ${albatoRes.status}`);

     // C. Log Success to AXiM Core
     await logTelemetry(env, 'SYNC_SUCCESS', 'INFO', `Successfully pushed ${uniqueRecords.length} leads to CRM.`);

  } catch (error) {
     await logTelemetry(env, 'DISPATCH_FAULT', 'CRITICAL', error.message);
  }
}