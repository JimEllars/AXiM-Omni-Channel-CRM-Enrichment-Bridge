import re

with open('src/index.js', 'r') as f:
    content = f.read()

# Add GET /v1/management/config/backup-timestamp route
timestamp_route = """
    if (url.pathname === '/v1/management/config/backup-timestamp' && request.method === 'GET') {
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const authHeader = request.headers.get('Authorization');

        let isAuthorized = false;
        if (internalAuth && internalAuth === env.AXIM_INTERNAL_KEY) isAuthorized = true;
        if (authHeader && authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}`) isAuthorized = true;
        if (internalAuth && env.AXIM_FALLBACK_KEY && internalAuth === env.AXIM_FALLBACK_KEY) isAuthorized = true;

        if (!isAuthorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { 'Content-Type': 'application/json' }});
        }

        let timestamp = null;
        if (env.CRM_BRIDGE_ROUTING_RULES) {
            timestamp = await env.CRM_BRIDGE_ROUTING_RULES.get('config:last_backup_timestamp');
        }

        return new Response(JSON.stringify({ timestamp: timestamp }), { status: 200, headers: { 'Content-Type': 'application/json' }});
    }
"""

content = content.replace(
"""    // POST route for manual backup
    if (url.pathname === '/v1/management/backup' && request.method === 'POST') {""",
timestamp_route + """\n    // POST route for manual backup
    if (url.pathname === '/v1/management/backup' && request.method === 'POST') {"""
)

with open('src/index.js', 'w') as f:
    f.write(content)

print("Done")
