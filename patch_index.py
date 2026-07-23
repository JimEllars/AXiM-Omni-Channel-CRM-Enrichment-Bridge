import re

with open('src/index.js', 'r') as f:
    content = f.read()

# Replace GET /v1/management/analytics logic
new_analytics = """    if (url.pathname === '/v1/management/analytics' && request.method === 'GET') {
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
        if (env.CRM_BRIDGE_ROUTING_RULES) {
          const val = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
          const dropsVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:rate_limit_drops:total');
          const edgeSuccessVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:success_count');
          const edgeFallbackVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:fallback_count');
          rateLimitDrops = dropsVal ? parseInt(dropsVal, 10) : 0;
          cognitiveRescues = val ? parseInt(val, 10) : 0;
          edgeAiSuccess = edgeSuccessVal ? parseInt(edgeSuccessVal, 10) : 0;
          edgeAiFallback = edgeFallbackVal ? parseInt(edgeFallbackVal, 10) : 0;
        }

        let agentUploads = 0;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
           const auVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:agent_uploads:total');
           agentUploads = auVal ? parseInt(auVal, 10) : 0;
        }

        return new Response(JSON.stringify({ cognitive_rescues: cognitiveRescues, rate_limit_drops: rateLimitDrops, agent_uploads: agentUploads, edge_ai_success: edgeAiSuccess, edge_ai_fallback: edgeAiFallback }), {"""
content = re.sub(
    r"    if \(url\.pathname === '/v1/management/analytics' && request\.method === 'GET'\) \{.*?(?=          status: 200,)",
    new_analytics,
    content,
    flags=re.DOTALL
)

with open('src/index.js', 'w') as f:
    f.write(content)
