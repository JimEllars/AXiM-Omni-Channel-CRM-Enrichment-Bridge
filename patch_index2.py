import re

with open('src/index.js', 'r') as f:
    content = f.read()

# Add /v1/management/restore endpoint
restore_endpoint_code = """
    if (url.pathname === '/v1/management/restore' && request.method === 'POST') {
      try {
        const internalAuth = request.headers.get('X-AXiM-Internal-Auth');
        const authHeader = request.headers.get('Authorization');

        let isAuthorized = false;
        if (internalAuth && internalAuth === env.AXIM_INTERNAL_KEY) isAuthorized = true;
        if (authHeader && authHeader === `Bearer ${env.AXIM_INTERNAL_KEY}`) isAuthorized = true;
        if (internalAuth && env.AXIM_FALLBACK_KEY && internalAuth === env.AXIM_FALLBACK_KEY) isAuthorized = true;

        if (!isAuthorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { 'Content-Type': 'application/json' }});
        }

        const supabaseUrl = env.SUPABASE_URL || env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
        const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.AXIM_INTERNAL_KEY;

        const res = await fetch(`${supabaseUrl}/rest/v1/bridge_config_backups?select=payload,created_at&order=created_at.desc&limit=1`, {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
           return new Response(JSON.stringify({ error: `Supabase fetch failed: ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' }});
        }

        const backups = await res.json();
        if (!backups || backups.length === 0) {
           return new Response(JSON.stringify({ error: "No backups found" }), { status: 404, headers: { 'Content-Type': 'application/json' }});
        }

        const backup = backups[0];
        if (!backup.payload || typeof backup.payload !== 'object') {
           return new Response(JSON.stringify({ error: "Invalid backup payload format" }), { status: 400, headers: { 'Content-Type': 'application/json' }});
        }

        const payload = backup.payload;

        if (env.CRM_BRIDGE_ROUTING_RULES) {
           if (payload.active_pipeline) {
              await env.CRM_BRIDGE_ROUTING_RULES.put('config:active_pipeline', JSON.stringify(payload.active_pipeline));
           }
           if (payload.scraper_api_keys) {
              await env.CRM_BRIDGE_ROUTING_RULES.put('config:scraper_api_keys', JSON.stringify(payload.scraper_api_keys));
           }
           if (payload.ecosystem_subscribers) {
              await env.CRM_BRIDGE_ROUTING_RULES.put('config:ecosystem_subscribers', JSON.stringify(payload.ecosystem_subscribers));
           }
           await env.CRM_BRIDGE_ROUTING_RULES.put('config:last_restore_timestamp', new Date().toISOString());
        }

        return new Response(JSON.stringify({ status: "success", message: "Restore successful", timestamp: backup.created_at }), { status: 200, headers: { 'Content-Type': 'application/json' }});

      } catch (e) {
        return new Response(JSON.stringify({ error: `Restore error: ${e.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' }});
      }
    }
"""

content = content.replace(
"""    // POST route for manual backup
    if (url.pathname === '/v1/management/backup' && request.method === 'POST') {""",
restore_endpoint_code + """\n    // POST route for manual backup
    if (url.pathname === '/v1/management/backup' && request.method === 'POST') {"""
)

with open('src/index.js', 'w') as f:
    f.write(content)

print("Done")
