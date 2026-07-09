import { formatForDeskera, formatForCore } from './utils/mapper.js';
import { sanitizeLeadData } from './utils/sanitize.js';
import { logTelemetry } from './utils/telemetry.js';
import { logToRecovery } from './utils/telemetry.js';
import { enrichRecord, callCognitiveProxy } from './utils/enrichmentLogic.js';

/**
 * Cloudflare Worker Entry Point
 * Omni-Channel CRM Enrichment Bridge
 */
let cachedWorkflows = null;
let cachedIpWhitelist = null;
let ipWhitelistCacheTime = 0;
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AXiM-Internal-Auth',
          'Access-Control-Max-Age': '86400',
        },
      });
    }




// GET route for DLQ pagination
    if (url.pathname === '/v1/management/dlq' && request.method === 'GET') {
      try {
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const authHeader = request.headers.get('Authorization');

        let isAuthorized = false;
        if (authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}` || internalAuth === env.AXIM_INTERNAL_KEY) {
           isAuthorized = true;
        }
        if (!isAuthorized) {
          return new Response('Unauthorized', { status: 401 });
        }

        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';

        const fetchRes = await fetch(`${coreRestUrl}/rest/v1/dlq_records?select=*&limit=${limit}&offset=${offset}&order=created_at.desc`, {
          method: 'GET',
          headers: {
            'apikey': env.AXIM_INTERNAL_KEY,
            'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
          }
        });

        if (!fetchRes.ok) {
           return new Response('Failed to fetch DLQ records', { status: 500 });
        }

        const data = await fetchRes.json();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response('Failed to fetch DLQ records', { status: 500 });
      }
    }

    // POST route for DLQ retry execution
    if (url.pathname === '/v1/management/dlq-retry' && request.method === 'POST') {
      try {
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const authHeader = request.headers.get('Authorization');

        let isAuthorized = false;
        if (authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}` || internalAuth === env.AXIM_INTERNAL_KEY) {
           isAuthorized = true;
        }
        if (!isAuthorized) {
          return new Response('Unauthorized', { status: 401 });
        }

        const { record_id } = await request.json();
        if (!record_id) {
          return new Response('Missing record_id', { status: 400 });
        }

        const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';

        // 1. Fetch specific record
        const getRes = await fetch(`${coreRestUrl}/rest/v1/dlq_records?id=eq.${record_id}`, {
          method: 'GET',
          headers: {
            'apikey': env.AXIM_INTERNAL_KEY,
            'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
          }
        });

        if (!getRes.ok) {
           return new Response('Failed to fetch DLQ record', { status: 500 });
        }

        const dlqData = await getRes.json();
        if (!dlqData || dlqData.length === 0) {
           return new Response('Record not found', { status: 404 });
        }

        const record = dlqData[0];
        let payload;
        try {
            payload = JSON.parse(record.payload);
        } catch(e) {
            payload = record.payload;
        }

        const recordsToProcess = Array.isArray(payload.records) ? payload.records : [payload];

        // 2. Process and dispatch
        // We reuse the processAndDispatch for core logic, but need to make sure we don't trigger ctx.waitUntil randomly
        await processAndDispatch(env, record.source || 'dlq_retry', recordsToProcess, ctx);

        // 3. Delete upon success
        const deleteRes = await fetch(`${coreRestUrl}/rest/v1/dlq_records?id=eq.${record_id}`, {
          method: 'DELETE',
          headers: {
            'apikey': env.AXIM_INTERNAL_KEY,
            'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
          }
        });

        if (!deleteRes.ok) {
           return new Response('Retry executed but failed to delete from DLQ', { status: 500 });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(`Retry Error: ${error.message}`, { status: 500 });
      }
    }

    // POST route for Cognitive Testing Sandbox
    if (url.pathname === '/v1/management/cognitive-test' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        const payload = await request.json();
        const extracted = await callCognitiveProxy(env, ctx, payload);

        return new Response(JSON.stringify(extracted), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // DELETE route for DLQ dismissal
    if (url.pathname === '/v1/management/dlq-dismiss' && request.method === 'DELETE') {
      try {
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const authHeader = request.headers.get('Authorization');

        let isAuthorized = false;
        if (authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}` || internalAuth === env.AXIM_INTERNAL_KEY) {
           isAuthorized = true;
        }
        if (!isAuthorized) {
          return new Response('Unauthorized', { status: 401 });
        }

        const recordId = url.searchParams.get('recordId');
        if (!recordId) {
          return new Response('Missing recordId', { status: 400 });
        }


        const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
        const deleteRes = await fetch(`${coreRestUrl}/rest/v1/dlq_records?id=eq.${recordId}`, {
          method: 'DELETE',
          headers: {
            'apikey': env.AXIM_INTERNAL_KEY,
            'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
          }
        });

        if (!deleteRes.ok) {
           console.error("Failed to dismiss DLQ alert in Supabase");
           return new Response('Failed to dismiss DLQ alert', { status: 500 });
        }

        return new Response(JSON.stringify({ success: true, message: 'Record dismissed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error("DLQ Dismiss Error:", error);
        return new Response('Failed to dismiss DLQ alert', { status: 500 });
      }
    }

    if (url.pathname === '/v1/management/kv-check' && request.method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const email = url.searchParams.get('email') || url.searchParams.get('query');
        if (!email) {
          return new Response('Missing email query parameter', { status: 400 });
        }

        if (!env.CRM_BRIDGE_DEDUPE) {
           return new Response('CRM_BRIDGE_DEDUPE not bound', { status: 500 });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const hashedKey = await hashDedupeKey(normalizedEmail);

        const isDuplicate = await env.CRM_BRIDGE_DEDUPE.get(`lead:${hashedKey}`);

        return new Response(JSON.stringify({
          query: normalizedEmail,
          hashedKey,
          locked: !!isDuplicate
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "kv_check_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: error.message
      }
    }));
        return new Response('Internal Check Error', { status: 500 });
      }
    }

    if (url.pathname === '/v1/management/sync' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        let count = 0;

        // Try to parse JSON payload first (for UI updates like IP whitelist)
        let hasJsonPayload = false;
        try {
            const reqClone = request.clone();
            const payload = await reqClone.json();
            if (payload && Array.isArray(payload.ip_whitelist) && env.CRM_BRIDGE_ROUTING_RULES) {
                await env.CRM_BRIDGE_ROUTING_RULES.put('config:ip_whitelist', JSON.stringify(payload.ip_whitelist));

                // Cache Busting
                cachedIpWhitelist = null;
                globalThis.cachedIpWhitelist = null;
                ipWhitelistCacheTime = 0;
                globalThis.ipWhitelistCacheTime = 0;

                count++;
                hasJsonPayload = true;
            }
        } catch(e) {
            // Not a JSON payload, proceed to sheet sync
        }

        // If not a JSON update, it's no longer supported due to zero-GCP mandate
        if (!hasJsonPayload) {
            return new Response(JSON.stringify({ error: 'Config sync requires JSON payload (GCP deprecated)' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ status: 'Synced', count }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "sync_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: error.message
      }
    }));
        return new Response('Sync Error', { status: 500 });
      }
    }


    if (url.pathname === '/v1/management/dry-run' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        const rawPayload = await request.json();

        let records = [];
        if (Array.isArray(rawPayload.records)) {
          records = rawPayload.records;
        } else if (rawPayload.record) {
          records = [rawPayload.record];
        } else if (Array.isArray(rawPayload)) {
          records = rawPayload;
        } else {
          return new Response('Invalid Payload Format', { status: 400 });
        }

        let workflows = null;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
          try {
            workflows = await env.CRM_BRIDGE_ROUTING_RULES.get('config:automation_workflows', 'json');
          } catch (e) {
            workflows = null;
          }
        }

        const rulesToApply = workflows && workflows.rules ? workflows.rules : [];
        const sanitizedRecords = records.map(record => sanitizeLeadData(record, rulesToApply));
        const validRecords = sanitizedRecords.filter(r => r.isValid);

        let mappedRecords = [];

        // Very basic mock logic for which mapping to use based on rules, since exact logic isn't specified in prompt except "either formatForDeskera or formatForCore depending on the rule evaluation"
        let useCore = false;
        for (const rule of rulesToApply) {
             if (rule.action && rule.action.type === 'ROUTE_TO_CORE') {
                 useCore = true;
             }
        }

        if (useCore) {
           mappedRecords = formatForCore(validRecords);
        } else {
           mappedRecords = formatForDeskera(validRecords);
        }

        return new Response(JSON.stringify(mappedRecords), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response('Dry Run Error: ' + error.message, { status: 500 });
      }
    }

    if (url.pathname === '/v1/management/rollback' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        const backup = await env.CRM_BRIDGE_ROUTING_RULES.get("config:automation_workflows:backup", "json");
        if (backup) {
          await env.CRM_BRIDGE_ROUTING_RULES.put("config:automation_workflows", JSON.stringify(backup));
        }

        if (typeof cachedWorkflows !== 'undefined') {
          cachedWorkflows = null;
        } else {
          globalThis.cachedWorkflows = null;
        }

        return new Response(JSON.stringify({ status: 'Rollback Complete' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        return new Response('Rollback Error', { status: 500 });
      }
    }

    // INGRESS: Webhook Catcher Endpoint
    if (url.pathname === '/v1/webhooks/enrich' && request.method === 'POST') {
      try {

        // IP Whitelisting Check
        const clientIpHeader = request.headers.get('CF-Connecting-IP');
        const now = Date.now();
        if (!cachedIpWhitelist || now - ipWhitelistCacheTime > 60000) {
            if (env.CRM_BRIDGE_ROUTING_RULES) {
                const kvIps = await env.CRM_BRIDGE_ROUTING_RULES.get('config:ip_whitelist', 'json');
                if (kvIps && Array.isArray(kvIps)) {
                    cachedIpWhitelist = kvIps;
                } else {
                    cachedIpWhitelist = []; // Empty or null -> fail-open logic
                }
            } else {
                cachedIpWhitelist = [];
            }
            ipWhitelistCacheTime = now;
            globalThis.cachedIpWhitelist = cachedIpWhitelist;
            globalThis.ipWhitelistCacheTime = ipWhitelistCacheTime;
        }

        if (cachedIpWhitelist && cachedIpWhitelist.length > 0) {
          const clientIps = clientIpHeader ? clientIpHeader.split(',').map(ip => ip.trim()) : [];
          if (clientIps.length === 0) {
            return new Response('Forbidden: IP not allowed', { status: 403 });
          }
          const clientIp = clientIps[0];
          if (!cachedIpWhitelist.includes(clientIp)) {
             return new Response('Forbidden: IP not allowed', { status: 403 });
          }
        }
        // Authenticate incoming traffic using internal AXiM service key or fallback client secret
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const clientSecret = request.headers.get('X-AXiM-Client-Secret');

        let isAuthorized = false;

        if (authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}` || internalAuth === env.AXIM_INTERNAL_KEY) {
           isAuthorized = true;
        } else if (clientSecret && (clientSecret === env.AXIM_CLIENT_SECRET || clientSecret === env.AXIM_CLIENT_SECRET_FALLBACK)) {
           isAuthorized = true;
        }

        if (!isAuthorized) {
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
        ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "ingress_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: error.message
      }
    }));
        return new Response('Internal Pipeline Error', { status: 500 });
      }
    }

    return new Response('Endpoint Not Found', { status: 404 });
  },

  // SCHEDULED: Cron Trigger Handler for Database Sweeps
  async scheduled(event, env, ctx) {
    try {
      ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_run",
        severity: "INFO",
        component_origin: "index.js",
        error_message: 'Nightly sync executed'
      }
    }));

      if (env.CRM_BRIDGE_DEDUPE) {
        let cursor = undefined;
        let totalSwept = 0;

        do {
          let listResult;
          try {
            listResult = await env.CRM_BRIDGE_DEDUPE.list({
              prefix: "pending_enrichment:",
              cursor: cursor
            });
          } catch (listError) {
            ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_kv_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `list() failed: ${listError.message}`
      }
    }));
            return; // Exit gracefully
          }

          if (listResult && listResult.keys) {
            for (const key of listResult.keys) {
              let recordStr;
              try {
                recordStr = await env.CRM_BRIDGE_DEDUPE.get(key.name);
              } catch (getError) {
                ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_kv_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `get() failed for ${key.name}: ${getError.message}`
      }
    }));
                continue;
              }

              if (recordStr) {
                try {
                  const record = JSON.parse(recordStr);
                  // Using ctx here as it is passed to processInBatches
                  await processInBatches(env, 'scheduled_sweep', [record], ctx);
                } catch (processError) {
                  ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_process_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Failed to process ${key.name}: ${processError.message}`
      }
    }));
                }
              }

              try {
                await env.CRM_BRIDGE_DEDUPE.delete(key.name);
                totalSwept++;
              } catch (deleteError) {
                ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_kv_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `delete() failed for ${key.name}: ${deleteError.message}`
      }
    }));
                continue;
              }
            }
          }

          cursor = listResult.list_complete ? undefined : listResult.cursor;
        } while (cursor);

        ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_run",
        severity: "INFO",
        component_origin: "index.js",
        error_message: `[CRON RUN] Swept: ${totalSwept} pending records from KV`
      }
    }));
      }
    } catch (error) {
      ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "cron_fault",
        severity: "CRITICAL",
        component_origin: "index.js",
        error_message: error.message
      }
    }));
    }
  }
};


async function hashDedupeKey(key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

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
          const enriched = await enrichRecord(env, ctx, sanitized);
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

      ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "batch_summary",
        severity: "INFO",
        component_origin: "index.js",
        error_message: `[BATCH IMPORT] Processed: ${chunk.length} | Success: ${successCount} | Enrichment Fails: ${enrichmentFailCount}`
      }
    }));
    } catch (error) {
      ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "batch_process_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Error in batch ${i / BATCH_SIZE}: ${error.message}`
      }
    }));
    }
  }
}

async function processAndDispatch(env, source, records, ctx) {
  try {
     // A. Deduplication Check (Using Cloudflare KV)
     const uniqueRecords = [];
     for (const record of records) {
         if (env.CRM_BRIDGE_DEDUPE && record.email) {
           const emailKey = record.email.toLowerCase().trim();
           let hashedKey;
           let isDuplicate = false;
           try {
               hashedKey = await hashDedupeKey(emailKey);
           } catch (hashError) {
               ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "hash_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Failed to hash dedupe key for ${emailKey}: ${hashError.message}. Failing open.`
      }
    }));
           }

           if (hashedKey) {
               try {
                   isDuplicate = await env.CRM_BRIDGE_DEDUPE.get(`lead:${hashedKey}`);
               } catch (kvError) {
                   ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "kv_read_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Failed to check deduplication for ${emailKey}: ${kvError.message}. Failing open.`
      }
    }));
               }
           }
           if (isDuplicate) {
               ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "duplicate_caught",
        severity: "INFO",
        component_origin: "index.js",
        error_message: `Duplicate record caught for email: ${emailKey}`
      }
    }));
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
     let coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
     let coreEndpoint = `${coreRestUrl}/rest/v1/crm_contacts`;

     // Align CRM Schema for Core
     const mappedRecords = formatForCore(uniqueRecords);

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
         ctx.waitUntil(logToRecovery(env, source, "Pre-Flight Validation Failed", {
             destination: 'DLQ',
             original: uniqueRecords.filter((_, i) => mappedRecords[i]._is_invalid),
             mapped: invalidRecords
         }));
         ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "pre_flight_validation_failed",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `${invalidRecords.length} records failed pre-flight validation.`
      }
    }));
     }

     if (validRecords.length === 0) return;

     const dispatchPayload = {
         metadata: { source: source, processed_at: new Date().toISOString() },
         data: validRecords
     };

     let coreSuccess = false;

     // 1. Exclusive Dispatch to AXiM Core (Supabase POST /rest/v1/crm_contacts)
     try {
       const controller = new AbortController();
       const timeoutId = setTimeout(() => controller.abort(), 10000);

       const coreRes = await fetch(coreEndpoint, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'apikey': env.AXIM_INTERNAL_KEY,
             'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`,
             'Prefer': 'resolution=merge-duplicates'
           },
           body: JSON.stringify(validRecords),
           signal: controller.signal
       });
       clearTimeout(timeoutId);

       if (!coreRes.ok) {
           ctx.waitUntil(logToRecovery(env, source, "Core 500/Rejection", {
             destination: 'Core',
             original: uniqueRecords,
             mapped: validRecords
           }));
           ctx.waitUntil(logTelemetry(env, {
             telemetry_envelope: {
               project_id: "AXIM_CRM_BRIDGE",
               environment: env.ENVIRONMENT || "production",
               timestamp: new Date().toISOString()
             },
             event_payload: {
               event_type: "egress_fault_core",
               severity: "HIGH",
               component_origin: "index.js",
               error_message: `Core rejection: ${coreRes.status}`
             }
           }));
       } else {
           coreSuccess = true;
           ctx.waitUntil(logTelemetry(env, {
             telemetry_envelope: {
               project_id: "AXIM_CRM_BRIDGE",
               environment: env.ENVIRONMENT || "production",
               timestamp: new Date().toISOString()
             },
             event_payload: {
               event_type: "sync_success_core",
               severity: "INFO",
               component_origin: "index.js",
               error_message: `Successfully synced ${validRecords.length} records to AXiM Core`
             }
           }));
       }
     } catch (e) {
         ctx.waitUntil(logToRecovery(env, source, "Core Network Error", {
             destination: 'Core',
             original: uniqueRecords,
             mapped: validRecords
         }));
         ctx.waitUntil(logTelemetry(env, {
           telemetry_envelope: {
             project_id: "AXIM_CRM_BRIDGE",
             environment: env.ENVIRONMENT || "production",
             timestamp: new Date().toISOString()
           },
           event_payload: {
             event_type: "egress_fault_core",
             severity: "HIGH",
             component_origin: "index.js",
             error_message: `Core dispatch failed: ${e.message}`
           }
         }));
     }

     // Only save to KV after 200 OK from destination
     if (env.CRM_BRIDGE_DEDUPE && coreSuccess) {
         for (const record of uniqueRecords) {
             if (record.email) {
                 const emailKey = record.email.toLowerCase().trim();
                 let hashedKey;
                 try {
                     hashedKey = await hashDedupeKey(emailKey);
                 } catch (hashError) {
                     ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "hash_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Failed to hash dedupe key for ${emailKey} during write: ${hashError.message}.`
      }
    }));
                 }

                 if (hashedKey) {
                     // waitUntil allows fire and forget for KV put
                     try {
                         if (ctx && ctx.waitUntil) {
                             ctx.waitUntil((async () => {
                                 try {
                                     await env.CRM_BRIDGE_DEDUPE.put(`lead:${hashedKey}`, "true", { expirationTtl: 86400 });
                                 } catch (writeErr) {
                                     ctx.waitUntil(logTelemetry(env, {
                                          telemetry_envelope: {
                                            project_id: "AXIM_CRM_BRIDGE",
                                            environment: env.ENVIRONMENT || "production",
                                            timestamp: new Date().toISOString()
                                          },
                                          event_payload: {
                                            event_type: "kv_write_fault",
                                            severity: "HIGH",
                                            component_origin: "index.js",
                                            error_message: `Failed to write deduplication lock for ${emailKey}: ${writeErr.message}`
                                          }
                                      }));
                                 }
                             })());
                         } else {
                             await env.CRM_BRIDGE_DEDUPE.put(`lead:${hashedKey}`, "true", { expirationTtl: 86400 });
                         }
                     } catch (outerErr) {
                         ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "kv_write_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Failed to initiate write for ${emailKey}: ${outerErr.message}`
      }
    }));
                     }
                 }
             }
         }
     }

  } catch (error) {
     ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "dispatch_fault",
        severity: "CRITICAL",
        component_origin: "index.js",
        error_message: error.message
      }
    }));
  }
}


// --- SCHEDULED HANDLERS ---
async function performDatabaseSweep(env, ctx) {
  try {
    ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "sweep_start",
        severity: "INFO",
        component_origin: "index.js",
        error_message: 'Starting nightly database sweep for enrichment.'
      }
    }));

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

    ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "sweep_complete",
        severity: "INFO",
        component_origin: "index.js",
        error_message: `Completed database sweep. Processed ${mockSweepData.length} records.`
      }
    }));
  } catch (error) {
    ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "sweep_fault",
        severity: "HIGH",
        component_origin: "index.js",
        error_message: `Error during database sweep: ${error.message}`
      }
    }));
  }
}
