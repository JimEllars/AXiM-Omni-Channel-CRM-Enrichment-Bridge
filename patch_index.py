import re

with open("src/index.js", "r") as f:
    content = f.read()

# Add a POST endpoint `/v1/management/pipeline-config`
# Insert it after the /v1/management/dlq-dismiss endpoint
target_endpoint = "    if (url.pathname === '/v1/management/dlq-dismiss' && request.method === 'DELETE') {"
new_endpoint = """
    if (url.pathname === '/v1/management/pipeline-config' && request.method === 'POST') {
      try {
        const authHeader = request.headers.get('Authorization');
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        if (authHeader !== `Bearer ${env.AXIM_INTERNAL_KEY}` && internalAuth !== env.AXIM_INTERNAL_KEY) {
          return new Response('Unauthorized', { status: 401 });
        }
        const rawPayload = await request.json();
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

"""
content = content.replace(target_endpoint, new_endpoint + target_endpoint)


# Update the `/v1/webhooks/enrich` route to fetch `config:active_pipeline` securely and efficiently
target_enrich = """        if (rawPayload.test_mode) {
           let results = [];
           for (const record of records) {
              const sanitized = sanitizeLeadData(record);
              if (sanitized.isValid) {
                 const enriched = await enrichRecord(env, ctx, sanitized);
                 results.push(enriched);
              } else {
                 results.push(sanitized);
              }
           }
           return new Response(JSON.stringify(results), {
               status: 200,
               headers: { 'Content-Type': 'application/json' }
           });
        }"""
new_enrich = """
        // Fetch active pipeline configuration
        let activePipeline = null;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
            try {
                // Use cache if possible or just fetch. Since we are in workers, KV gets are fast but could be cached
                const configStr = await env.CRM_BRIDGE_ROUTING_RULES.get('config:active_pipeline');
                if (configStr) {
                    activePipeline = JSON.parse(configStr);
                }
            } catch (e) {
                console.error("Failed to load active pipeline config", e);
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
        }"""
content = content.replace(target_enrich, new_enrich)

# Ensure batch processing passes activePipeline
target_batch = "ctx.waitUntil(processInBatches(env, source, records, ctx));"
new_batch = "ctx.waitUntil(processInBatches(env, source, records, ctx, activePipeline));"
content = content.replace(target_batch, new_batch)

# Update processInBatches signature
target_process = "async function processInBatches(env, source, records, ctx) {"
new_process = "async function processInBatches(env, source, records, ctx, activePipeline = null) {"
content = content.replace(target_process, new_process)

# Update enrichRecord call inside processInBatches
target_enrich_call = "const enriched = await enrichRecord(env, ctx, sanitized);"
new_enrich_call = "const enriched = await enrichRecord(env, ctx, sanitized, activePipeline);"
content = content.replace(target_enrich_call, new_enrich_call)

# Ensure processAndDispatch takes activePipeline
target_dispatch_call = "await processAndDispatch(env, source, cleanRecords, ctx);"
new_dispatch_call = "await processAndDispatch(env, source, cleanRecords, ctx, activePipeline);"
content = content.replace(target_dispatch_call, new_dispatch_call)

# Update processAndDispatch signature
target_dispatch = "async function processAndDispatch(env, source, records, ctx) {"
new_dispatch = "async function processAndDispatch(env, source, records, ctx, activePipeline = null) {"
content = content.replace(target_dispatch, new_dispatch)

# Update formatForCore call inside processAndDispatch
target_format = "const mappedRecords = formatForCore(uniqueRecords);"
new_format = "const mappedRecords = formatForCore(uniqueRecords, activePipeline);"
content = content.replace(target_format, new_format)

with open("src/index.js", "w") as f:
    f.write(content)
