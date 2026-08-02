with open("src/index.js", "r") as f:
    content = f.read()

# Fix activePipeline used before defined in index.js:1010
target_stream = """        const sendEvent = async (data) => {
           await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\\n\\n`));
        };

        ctx.waitUntil((async () => {
            try {"""

new_stream = """        const sendEvent = async (data) => {
           await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\\n\\n`));
        };

        let activePipeline = null;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
            try {
                const configStr = await env.CRM_BRIDGE_ROUTING_RULES.get('config:active_pipeline');
                if (configStr) {
                    activePipeline = JSON.parse(configStr);
                }
            } catch (e) {
                console.error("Failed to load active pipeline config", e);
            }
        }

        ctx.waitUntil((async () => {
            try {"""

content = content.replace(target_stream, new_stream)

# Remove the duplication in src/utils/enrichmentLogic.js
with open("src/utils/enrichmentLogic.js", "r") as f2:
    enrich = f2.read()

enrich = enrich.replace("""        parsed.metadata = {
          ...(parsed.metadata || {}),
          ai_enriched: true,
          provider: 'cloudflare_workers_ai',
          ai_provider: 'llama-3.1-8b',
          enriched_at: new Date().toISOString()
        };""", """        parsed.metadata = {
          ...(parsed.metadata || {}),
          ai_enriched: true,
          provider: 'cloudflare_workers_ai',
          enriched_at: new Date().toISOString()
        };""")

enrich = enrich.replace("""            extractedContent.metadata = {
                ...(extractedContent.metadata || {}),
                ai_enriched: true,
                ai_provider: 'fallback_proxy',
                enriched_at: new Date().toISOString()
            };""", """            extractedContent.metadata = {
                ...(extractedContent.metadata || {}),
                ai_enriched: true,
                enriched_at: new Date().toISOString()
            };""")

with open("src/utils/enrichmentLogic.js", "w") as f2:
    f2.write(enrich)

with open("src/index.js", "w") as f:
    f.write(content)
