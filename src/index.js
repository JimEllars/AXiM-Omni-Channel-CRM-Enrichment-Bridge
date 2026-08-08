import { formatForDeskera, formatForCore, formatForUniversal } from './utils/mapper.js';
import { sanitizeLeadData } from './utils/sanitize.js';
import { logTelemetry } from './utils/telemetry.js';
import { logToRecovery } from './utils/telemetry.js';
import { enrichRecord, callCognitiveProxy, processAgentBatch } from './utils/enrichmentLogic.js';

/**
 * Cloudflare Worker Entry Point
 * Omni-Channel CRM Enrichment Bridge
 */
const rateLimitMap = new Map();
let cachedWorkflows = null;
let cachedIpWhitelist = null;
let ipWhitelistCacheTime = 0;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AXiM-Internal-Auth',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    // Universal CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      let response = await this.handleRequest(request, env, ctx);

      // If response is undefined for some reason, return 404
      if (!response) {
         response = new Response('Not Found', { status: 404 });
      }

      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
          newHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  },

  async handleRequest(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight requests

    // Phase 2: Edge Health Check
    if (url.pathname === '/v1/health' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: "ok",
        version: "v3-edge",
        region: request.cf ? request.cf.colo : "local"
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

    // POST route for Onyx Agent Key Management
    if (url.pathname === '/v1/management/onyx-key' && request.method === 'POST') {
      try {
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        const payload = await request.json();
        const { hashed_key } = payload;

        if (!hashed_key) {
           return new Response('Missing hashed_key', { status: 400 });
        }

        if (env.CRM_BRIDGE_ROUTING_RULES) {
           const validKeysData = await env.CRM_BRIDGE_ROUTING_RULES.get('config:onyx_agent_keys', 'json') || [];
           if (!validKeysData.includes(hashed_key)) {
               validKeysData.push(hashed_key);
               await env.CRM_BRIDGE_ROUTING_RULES.put('config:onyx_agent_keys', JSON.stringify(validKeysData));
           }
        }

        return new Response(JSON.stringify({ success: true, message: 'Key provisioned successfully' }), {
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


    // GET route for Analytics Metrics

    // POST route for Ecosystem / Scraper Ingest
    if (url.pathname === '/v1/ecosystem/ingest' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const clientSecret = request.headers.get('X-AXiM-Client-Secret');

        let isAuthorized = false;
        let scraperApiKeys = [];
        try {
           if (env.CRM_BRIDGE_ROUTING_RULES) {
               const keysStr = await env.CRM_BRIDGE_ROUTING_RULES.get('config:scraper_api_keys');
               if (keysStr) {
                   scraperApiKeys = JSON.parse(keysStr);
               }
           }
        } catch (e) {
           console.error('Failed to get scraper_api_keys', e);
        }

        const providedKey = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : (internalAuth || clientSecret);

        if (providedKey && scraperApiKeys.includes(providedKey)) {
           isAuthorized = true;
        }

        if (!isAuthorized) {
          return new Response('Unauthorized', { status: 401 });
        }

        const payload = await request.json();

        ctx.waitUntil((async () => {
          try {
            // Process payload with cognitive proxy
            let dataToProcess = payload;
            if (!Array.isArray(payload) && !payload.records) {
              dataToProcess = [payload];
            } else if (payload.records) {
              dataToProcess = payload.records;
            }

            const processedRecords = [];
            for (const record of dataToProcess) {
               // Use cognitive proxy to clean the data
               const cleanData = await callCognitiveProxy(env, ctx, { ...record, strict_local_ai: false });
               const recordData = cleanData.record ? cleanData.record : cleanData;
               processedRecords.push(recordData);
            }

            // Map to generic Universal format
            const mappedRecords = formatForUniversal(processedRecords);
            const validRecords = mappedRecords.filter(r => !r._is_invalid);

            if (validRecords.length > 0 && env.CRM_BRIDGE_DEDUPE) {
               let ttl = 86400 * 7; // Default 7 days
               if (env.CRM_BRIDGE_ROUTING_RULES) {
                   try {
                       const savedTtl = await env.CRM_BRIDGE_ROUTING_RULES.get('config:ecosystem_ttl');
                       if (savedTtl) {
                           ttl = parseInt(savedTtl, 10);
                       }
                   } catch (e) {
                       console.error('Failed to get ecosystem_ttl', e);
                   }
               }
               const uuid = crypto.randomUUID();
               await env.CRM_BRIDGE_DEDUPE.put(`ecosystem_data:${uuid}`, JSON.stringify({
                   timestamp: new Date().toISOString(),
                   records: validRecords,
                   source: payload.source || 'universal_ingress'
               }), { expirationTtl: ttl });

               // Optionally update a recent list key for easy fetching
               const recentKey = 'ecosystem_data:recent_keys';
               const recentKeysStr = await env.CRM_BRIDGE_DEDUPE.get(recentKey);
               let recentKeys = recentKeysStr ? JSON.parse(recentKeysStr) : [];
               recentKeys.unshift(`ecosystem_data:${uuid}`);
               recentKeys = recentKeys.slice(0, 100); // Keep last 100
               await env.CRM_BRIDGE_DEDUPE.put(recentKey, JSON.stringify(recentKeys));

               // Dispatch ecosystem broadcast
               const broadcastPayload = {
                   metadata: { source: payload.source || 'universal_ingress', processed_at: new Date().toISOString() },
                   data: validRecords
               };
               const { sourceService } = await import('./services/sourceService.js');
               sourceService.dispatchEcosystemBroadcast(env, ctx, broadcastPayload);
            }
          } catch (e) {
            console.error('Ecosystem ingest processing failed in background:', e);
          }
        })());

        return new Response(JSON.stringify({ success: true, message: 'Payload accepted for ecosystem processing' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // GET route for Ecosystem / Scraper Data Fetch
    if (url.pathname === '/v1/ecosystem/data' && request.method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const clientSecret = request.headers.get('X-AXiM-Client-Secret');

        let isAuthorized = false;
        if (authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}` || internalAuth === env.AXIM_INTERNAL_KEY) {
           isAuthorized = true;
        } else if (clientSecret && env.AXIM_CLIENT_SECRET && clientSecret === env.AXIM_CLIENT_SECRET) {
           isAuthorized = true;
        }

        if (!isAuthorized) {
          return new Response('Unauthorized', { status: 401 });
        }

        if (!env.CRM_BRIDGE_DEDUPE) {
           return new Response(JSON.stringify({ error: 'KV Store not bound' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        const urlObj = new URL(request.url);
        let limitParam = parseInt(urlObj.searchParams.get('limit'), 10);
        let limit = isNaN(limitParam) ? 50 : Math.min(limitParam, 500); // hard cap at 500
        let cursor = urlObj.searchParams.get('cursor');

        let allRecords = [];

        const listOptions = { prefix: 'ecosystem_data:', limit };
        if (cursor) {
            listOptions.cursor = cursor;
        }

        const listed = await env.CRM_BRIDGE_DEDUPE.list(listOptions);

        for (const keyObj of listed.keys) {
            // Ignore the recent_keys list
            if (keyObj.name === 'ecosystem_data:recent_keys') continue;

            const dataStr = await env.CRM_BRIDGE_DEDUPE.get(keyObj.name);
            if (dataStr) {
                try {
                    const data = JSON.parse(dataStr);
                    if (data.records && Array.isArray(data.records)) {
                        allRecords.push(...data.records);
                    }
                } catch(e) { console.warn("Failed to parse data for key:", keyObj.name); }
            }
        }

        const responsePayload = { success: true, data: allRecords };
        if (!listed.list_complete) {
            responsePayload.next_cursor = listed.cursor;
        }

        return new Response(JSON.stringify(responsePayload), {
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

    // POST route for Onyx Agent Batch Ingress
    if (url.pathname === '/v1/agent/batch-upload' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader ? authHeader.replace('Bearer ', '').trim() : null;
        let isAuthorized = false;

        if (token) {
           const hashedToken = await hashDedupeKey(token);
           if (env.CRM_BRIDGE_ROUTING_RULES) {
               const validKeysData = await env.CRM_BRIDGE_ROUTING_RULES.get('config:onyx_agent_keys', 'json') || [];
               if (validKeysData.includes(hashedToken)) {
                   isAuthorized = true;
               }
           }
        }

        if (!isAuthorized) {
          return new Response('Unauthorized', { status: 401 });
        }

        const payload = await request.json();

        // Phase 1: Hard Payload Limits
        const records = Array.isArray(payload) ? payload : (payload.records || []);
        if (records.length > 1000) {
          return new Response(JSON.stringify({
            error: 'Payload Too Large',
            message: 'Batch exceeds 1,000 records. Please chunk your batch to 1,000 records or fewer.'
          }), {
            status: 413,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        ctx.waitUntil((async () => {
          try {
            // 1. Process batch using cognitive proxy
            const processedRecords = await processAgentBatch(env, ctx, { records, strict_local_ai: payload.strict_local_ai });

            if (processedRecords && processedRecords.length > 0) {
              // 2. Attribute tags
              const taggedRecords = processedRecords.map(record => ({
                ...record,
                lead_source: 'onyx_desktop_agent',
                metadata: {
                  ...(record.metadata || {}),
                  source: 'onyx_desktop_agent'
                }
              }));

              // 3. Dispatch to CRM
              await processAndDispatch(env, 'onyx_desktop_agent', taggedRecords, ctx);

              // 4. Increment telemetry
              if (env.CRM_BRIDGE_ROUTING_RULES) {
                 const currentVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:agent_uploads:total');
                 const newVal = (currentVal ? parseInt(currentVal, 10) : 0) + taggedRecords.length;
                 await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:agent_uploads:total', newVal.toString());
              }
            }
          } catch (e) {
            console.error('Agent batch processing failed in background:', e);
          }
        })());

        return new Response(JSON.stringify({ success: true, message: 'Batch accepted for processing' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/v1/management/analytics' && request.method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        let cognitiveRescues = 0;
        let rateLimitDrops = 0;
        let edgeAiSuccess = 0;
        let edgeAiFallback = 0;
        let automatedSuccess = 0;
        let broadcastFailed = 0;
        let broadcastSuccess = 0;

        if (env.CRM_BRIDGE_ROUTING_RULES) {
          const val = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
          const dropsVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:rate_limit_drops:total');
          const edgeSuccessVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:success_count');
          const edgeFallbackVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:fallback_count');
          const autoSuccessVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:recovery:automated_success');
          const broadcastFailVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:broadcast:failed');
          const broadcastSuccVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:broadcast:success');

          rateLimitDrops = dropsVal ? parseInt(dropsVal, 10) : 0;
          cognitiveRescues = val ? parseInt(val, 10) : 0;
          edgeAiSuccess = edgeSuccessVal ? parseInt(edgeSuccessVal, 10) : 0;
          edgeAiFallback = edgeFallbackVal ? parseInt(edgeFallbackVal, 10) : 0;
          automatedSuccess = autoSuccessVal ? parseInt(autoSuccessVal, 10) : 0;
          broadcastFailed = broadcastFailVal ? parseInt(broadcastFailVal, 10) : 0;
          broadcastSuccess = broadcastSuccVal ? parseInt(broadcastSuccVal, 10) : 0;
        }

        let agentUploads = 0;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
           const auVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:agent_uploads:total');
           agentUploads = auVal ? parseInt(auVal, 10) : 0;
        }

        return new Response(JSON.stringify({
          cognitive_rescues: cognitiveRescues,
          rate_limit_drops: rateLimitDrops,
          agent_uploads: agentUploads,
          edge_ai_success: edgeAiSuccess,
          edge_ai_fallback: edgeAiFallback,
          automated_success: automatedSuccess,
          broadcast_failed: broadcastFailed,
          broadcast_success: broadcastSuccess
        }), {
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

    // GET route for Diagnostics Export
    if (url.pathname === '/v1/management/analytics/reset' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        if (env.CRM_BRIDGE_ROUTING_RULES) {
          await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:ai_rescues:total', '0');
          await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:rate_limit_drops:total', '0');
        }

        return new Response(JSON.stringify({ success: true }), {
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

    if (url.pathname === '/v1/management/diagnostics' && request.method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }

        let cognitiveRescues = 0;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
          const val = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
          cognitiveRescues = val ? parseInt(val, 10) : 0;
        }

        // Mocking config values as requested in instructions
        // In a real scenario, these would be fetched from KV or Supabase
        const diagnostics = {
          "config:automation_workflows": "v4.2.1-stable",
          "config:ip_whitelist": ["192.168.1.1", "10.0.0.0/8", "172.16.0.0/12"],
          "alert_count:critical": 0,
          "analytics:ai_rescues:total": cognitiveRescues,
          "system_status": "Operational",
          "timestamp": new Date().toISOString()
        };

        return new Response(JSON.stringify(diagnostics), {
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

    if (url.pathname === '/v1/management/pipeline-config' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const role = request.headers.get('X-AXiM-Role');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }
        if (role !== 'superadmin') {
          return new Response('Forbidden', { status: 403 });
        }

        const rawPayload = await request.json();

        // Strict Schema Validation
        if (!Array.isArray(rawPayload)) {
            return new Response(JSON.stringify({ error: 'Payload must be an array of rules' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        for (const rule of rawPayload) {
            if (!rule.id || !rule.condition || !rule.action) {
                return new Response(JSON.stringify({ error: 'Invalid rule schema. Each rule must contain id, condition, and action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (env.CRM_BRIDGE_ROUTING_RULES) {
            await env.CRM_BRIDGE_ROUTING_RULES.put('config:active_pipeline', JSON.stringify(rawPayload));
        }
        return new Response(JSON.stringify({ status: 'success', message: 'Pipeline config saved' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
          return new Response('Error saving config: ' + e.message, { status: 500 });
      }
    }

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
            if (payload && payload.alert_webhook !== undefined && env.CRM_BRIDGE_ROUTING_RULES) {
                await env.CRM_BRIDGE_ROUTING_RULES.put('config:alert_webhook', payload.alert_webhook);
                count++;
                hasJsonPayload = true;
            }
            if (payload && payload.ecosystem_ttl !== undefined && env.CRM_BRIDGE_ROUTING_RULES) {
                await env.CRM_BRIDGE_ROUTING_RULES.put('config:ecosystem_ttl', payload.ecosystem_ttl.toString());
                count++;
                hasJsonPayload = true;
            }
            if (payload && Array.isArray(payload.scraper_api_keys) && env.CRM_BRIDGE_ROUTING_RULES) {
                await env.CRM_BRIDGE_ROUTING_RULES.put('config:scraper_api_keys', JSON.stringify(payload.scraper_api_keys));
                count++;
                hasJsonPayload = true;
            }
            if (payload && Array.isArray(payload.ecosystem_subscribers) && env.CRM_BRIDGE_ROUTING_RULES) {
                await env.CRM_BRIDGE_ROUTING_RULES.put('config:ecosystem_subscribers', JSON.stringify(payload.ecosystem_subscribers));
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

    // INGRESS: SSE Stream Ingestion Endpoint
    if (url.pathname === '/v1/ecosystem/stream-ingest' && request.method === 'POST') {
      try {
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

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        const sendEvent = async (data) => {
           await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let activePipeline = [];
        if (env.CRM_BRIDGE_ROUTING_RULES) {
            try {
                const configStr = await env.CRM_BRIDGE_ROUTING_RULES.get('config:active_pipeline');
                if (configStr) {
                    activePipeline = JSON.parse(configStr);
                }
            } catch (e) {
                console.error("Failed to load active pipeline config", e);
                // Fallback logic
                activePipeline = [{ id: 'default_rule', condition: { field: 'any', operator: 'exists' }, action: { type: 'pass' } }];
            }
        }

        ctx.waitUntil((async () => {
            try {
                if (rawPayload.target_destination === 'Ecosystem Broadcast') {
                    const uuid = crypto.randomUUID();
                    if (env.CRM_BRIDGE_DEDUPE) {
                        await env.CRM_BRIDGE_DEDUPE.put(`ecosystem_data:${uuid}`, JSON.stringify({
                            timestamp: new Date().toISOString(),
                            records: records,
                            source: source
                        }), { expirationTtl: 86400 });

                        const recentKey = 'ecosystem_data:recent_keys';
                        const recentKeysStr = await env.CRM_BRIDGE_DEDUPE.get(recentKey);
                        let recentKeys = recentKeysStr ? JSON.parse(recentKeysStr) : [];
                        recentKeys.unshift(`ecosystem_data:${uuid}`);
                        recentKeys = recentKeys.slice(0, 100);
                        await env.CRM_BRIDGE_DEDUPE.put(recentKey, JSON.stringify(recentKeys));
                    }

                    const broadcastPayload = {
                        metadata: { source: source, processed_at: new Date().toISOString() },
                        data: records
                    };
                    const { sourceService } = await import('./services/sourceService.js');
                    sourceService.dispatchEcosystemBroadcast(env, ctx, broadcastPayload);

                    await sendEvent({ progress: 100, status: "Broadcast complete." });
                } else {
                    const BATCH_SIZE = 50;
                    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
                    let processedCount = 0;

                    for (let i = 0; i < records.length; i += BATCH_SIZE) {
                        const chunk = records.slice(i, i + BATCH_SIZE);
                        const cleanRecords = [];
                        let enrichmentFailCount = 0;

                        await sendEvent({
                            progress: Math.round(((i) / records.length) * 100),
                            status: `Processing batch ${(i/BATCH_SIZE)+1}/${totalBatches} (${chunk.length} records)...`
                        });

                        for (const record of chunk) {
                            const sanitized = sanitizeLeadData(record);
                            if (sanitized.isValid) {
                                const enriched = await enrichRecord(env, ctx, sanitized, activePipeline);
                                if (enriched._enrichment_failed) {
                                    enrichmentFailCount++;
                                }
                                cleanRecords.push(enriched);
                            }
                        }

                        if (cleanRecords.length > 0) {
                            await processAndDispatch(env, source, cleanRecords, ctx, activePipeline);
                        }

                        processedCount += chunk.length;
                        await sendEvent({
                            progress: Math.round((processedCount / records.length) * 100),
                            status: `Batch ${(i/BATCH_SIZE)+1}/${totalBatches} complete. Enriched ${cleanRecords.length - enrichmentFailCount}, Failed ${enrichmentFailCount}`
                        });

                        // Yield event loop to prevent edge timeouts during heavy load
                        await new Promise(r => setTimeout(r, 0));
                    }

                    await sendEvent({ progress: 100, status: `Ingestion complete. Processed ${records.length} records.` });
                }
            } catch (e) {
                console.error("Stream processing error:", e);
                try {
                    await sendEvent({ progress: 100, status: "Error processing stream: " + e.message, error: true });
                } catch (sendError) { console.error('Failed to send error event', sendError); }
            } finally {
                writer.close();
            }
        })());

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
      } catch (error) {
         return new Response('Internal Pipeline Error: ' + error.message, { status: 500 });
      }
    }

    if (url.pathname === '/v1/webhooks/enrich' && request.method === 'POST') {
      try {

        // Rate Limiting Logic
        const clientIdentifier = request.headers.get('CF-Connecting-IP') || request.headers.get('X-AXiM-Client-Secret') || 'unknown';
        const currentTime = Date.now();

        let clientRequests = rateLimitMap.get(clientIdentifier) || [];
        // Filter out requests older than 60 seconds
        clientRequests = clientRequests.filter(timestamp => currentTime - timestamp < 60000);

        if (clientRequests.length >= 100) {

            if (env.CRM_BRIDGE_ROUTING_RULES) {
                ctx.waitUntil((async () => {
                    try {
                        const current = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:rate_limit_drops:total');
                        const count = (parseInt(current, 10) || 0) + 1;
                        await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:rate_limit_drops:total', count.toString());
                    } catch (e) {
                        // fail silently on analytics write error
                    }
                })());
            }
            return new Response('Too Many Requests', { status: 429 });
        }

        clientRequests.push(currentTime);
        rateLimitMap.set(clientIdentifier, clientRequests);

        // Memory Safety (Garbage Collection)
        // To prevent Map from exceeding Cloudflare's 128MB RAM limit over time
        if (rateLimitMap.size > 1000) {
            for (const [key, timestamps] of rateLimitMap.entries()) {
                const validTimestamps = timestamps.filter(timestamp => currentTime - timestamp < 60000);
                if (validTimestamps.length === 0) {
                    rateLimitMap.delete(key);
                } else {
                    rateLimitMap.set(key, validTimestamps);
                }
            }
            // If still too large, aggressive wipe to protect memory
            if (rateLimitMap.size > 1000) {
                rateLimitMap.clear();
            }
        }


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


        // Fetch active pipeline configuration
        let activePipeline = [];
        if (env.CRM_BRIDGE_ROUTING_RULES) {
            try {
                // Use cache if possible or just fetch. Since we are in workers, KV gets are fast but could be cached
                const configStr = await env.CRM_BRIDGE_ROUTING_RULES.get('config:active_pipeline');
                if (configStr) {
                    activePipeline = JSON.parse(configStr);
                }
            } catch (e) {
                console.error("Failed to load active pipeline config", e);
                // Fallback logic
                activePipeline = [{ id: 'default_rule', condition: { field: 'any', operator: 'exists' }, action: { type: 'pass' } }];
            }
        }

        if (rawPayload.test_mode) {
           let results = [];
           for (const record of records) {
              const sanitized = sanitizeLeadData(record);
              if (sanitized.isValid) {
                 const enriched = await enrichRecord(env, ctx, sanitized, activePipeline);
                 // Format with mapper to include lineage for testing
                 const mapped = formatForDeskera([enriched], activePipeline);
                 results.push(mapped[0]);
              } else {
                 results.push(sanitized);
              }
           }
           return new Response(JSON.stringify(results), {
               status: 200,
               headers: { 'Content-Type': 'application/json' }
           });
        }

        // Check for manual routing to ecosystem broadcast
        if (rawPayload.target_destination === 'Ecosystem Broadcast') {
           ctx.waitUntil((async () => {
              try {
                  const uuid = crypto.randomUUID();
                  if (env.CRM_BRIDGE_DEDUPE) {
                      await env.CRM_BRIDGE_DEDUPE.put(`ecosystem_data:${uuid}`, JSON.stringify({
                          timestamp: new Date().toISOString(),
                          records: records,
                          source: source
                      }), { expirationTtl: 86400 });

                      const recentKey = 'ecosystem_data:recent_keys';
                      const recentKeysStr = await env.CRM_BRIDGE_DEDUPE.get(recentKey);
                      let recentKeys = recentKeysStr ? JSON.parse(recentKeysStr) : [];
                      recentKeys.unshift(`ecosystem_data:${uuid}`);
                      recentKeys = recentKeys.slice(0, 100);
                      await env.CRM_BRIDGE_DEDUPE.put(recentKey, JSON.stringify(recentKeys));
                  }

                  const broadcastPayload = {
                      metadata: { source: source, processed_at: new Date().toISOString() },
                      data: records
                  };
                  const { sourceService } = await import('./services/sourceService.js');
                  sourceService.dispatchEcosystemBroadcast(env, ctx, broadcastPayload);
              } catch (e) {
                  console.error('Ecosystem manual routing failed in background:', e);
              }
           })());
        } else {
            // Out-of-band Processing via ctx.waitUntil
            // Processes array in small chunks (e.g. 50 records at a time) through sanitize and enrich
            ctx.waitUntil(processInBatches(env, source, records, ctx, activePipeline));
        }

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

  }
,

  // SCHEDULED: Cron Trigger Handler for Database Sweeps
  async scheduled(event, env, ctx) {

    const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
    const dlqEndpoint = `${coreRestUrl}/rest/v1/dlq_records`;

    const sweepPromise = (async () => {
      try {
        const fetchUrl = `${dlqEndpoint}?error_reason=eq.[OUTBOUND_SYNC_FAILED]`;
        const res = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'apikey': env.AXIM_INTERNAL_KEY,
            'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch DLQ records: ${res.status}`);
        }

        const records = await res.json();

        if (records && records.length > 0) {
          const { sourceService } = await import('./services/sourceService.js');
          const successCount = await sourceService.replayFailedOutbound(env, records);

          if (successCount > 0 && env.CRM_BRIDGE_ROUTING_RULES) {
            ctx.waitUntil((async () => {
              try {
                const currentStr = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:recovery:automated_success');
                const current = currentStr ? parseInt(currentStr, 10) : 0;
                await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:recovery:automated_success', (current + successCount).toString());
              } catch (kvError) {
                console.error("Failed to update automated_success in KV:", kvError);
              }
            })());
          }
        }

        const checkRes = await fetch(`${dlqEndpoint}?select=id`, {
           method: 'GET',
           headers: {
             'apikey': env.AXIM_INTERNAL_KEY,
             'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
           }
        });

        if (checkRes.ok) {
           const allRecords = await checkRes.json();
           if (allRecords.length > 50) {
              let alertUrl = null;
              if (env.CRM_BRIDGE_ROUTING_RULES) {
                  try {
                      alertUrl = await env.CRM_BRIDGE_ROUTING_RULES.get('config:alert_webhook');
                  } catch (e) {
                      console.error("Failed to fetch alert_webhook from KV:", e);
                  }
              }
              if (!alertUrl) {
                  alertUrl = env.ALERT_WEBHOOK_URL;
              }

              if (alertUrl) {
                 await fetch(alertUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                       text: "⚠️ AXiM Bridge Alert: DLQ threshold exceeded. >50 records pending manual review. Third-party CRM may be experiencing an outage."
                    })
                 });
              }
           }
        }
      } catch (error) {
        console.error("Scheduled task failed:", error.message);
      }
    })();

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(sweepPromise);
    } else {
      await sweepPromise;
    }
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

      // Phase 1: Supabase Stale Record Sweep (Worker Cron)
      try {
        const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
        const coreEndpoint = `${coreRestUrl}/rest/v1/crm_contacts`;
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const dateStr = ninetyDaysAgo.toISOString();

        const queryUrl = `${coreEndpoint}?created_at=lte.${dateStr}&firmographic_data=is.null&limit=50`;

        const supabaseRes = await fetch(queryUrl, {
          method: 'GET',
          headers: {
            'apikey': env.AXIM_INTERNAL_KEY,
            'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (supabaseRes.ok) {
          const staleRecords = await supabaseRes.json();
          if (staleRecords && staleRecords.length > 0) {
            const enrichPromises = staleRecords.map(async (record) => {
              try {
                // Ensure the record is pushed to the enrichment waterfall
                // sanitizeLeadData ensures the structure is correct
                const sanitized = sanitizeLeadData(record);
                if (sanitized.isValid) {
                   return await enrichRecord(env, ctx, sanitized);
                }
                return record;
              } catch (e) {
                return { ...record, _enrichment_failed: true, _enrichment_error: e.message };
              }
            });

            const settled = await Promise.allSettled(enrichPromises);

            const cleanRecords = [];
            for (const res of settled) {
              if (res.status === 'fulfilled' && res.value && !res.value._enrichment_failed) {
                 cleanRecords.push(res.value);
              }
            }

            if (cleanRecords.length > 0) {
              await processAndDispatch(env, 'supabase_stale_sweep', cleanRecords, ctx);
            }
          }
        }
      } catch (sweepErr) {
        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "cron_sweep_fault",
            severity: "HIGH",
            component_origin: "index.js",
            error_message: `Supabase sweep failed: ${sweepErr.message}`
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

async function processInBatches(env, source, rawRecords, ctx, activePipeline = null) {
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
          const enriched = await enrichRecord(env, ctx, sanitized, activePipeline);
          if (enriched._enrichment_failed) {
            enrichmentFailCount++;
          }
          cleanRecords.push(enriched);
        }
      }

      if (cleanRecords.length > 0) {
        await processAndDispatch(env, source, cleanRecords, ctx, activePipeline);
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

async function processAndDispatch(env, source, records, ctx, activePipeline = null) {
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
     const mappedRecords = formatForCore(uniqueRecords, activePipeline);

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
