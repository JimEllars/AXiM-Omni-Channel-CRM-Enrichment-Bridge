import re

with open('src/index.js', 'r') as f:
    content = f.read()

# Patch manual backup handler
manual_backup_pattern = re.compile(
    r"""(if \(\!res\.ok\) \{\n\s*console\.error\("Failed to backup configs to Supabase:", res\.status\);\n\s*\})(.*?)""", re.DOTALL)

def replace_manual_backup(match):
    return """if (!res.ok) {
                console.error("Failed to backup configs to Supabase:", res.status);
                ctx.waitUntil(logTelemetry(env, {
                  telemetry_envelope: {
                    project_id: "AXIM_CRM_BRIDGE",
                    environment: env.ENVIRONMENT || "production",
                    timestamp: new Date().toISOString()
                  },
                  event_payload: {
                    event_type: "backup_sync_failed",
                    severity: "HIGH",
                    component_origin: "index.js",
                    error_message: `[SUPABASE_BACKUP_FAILED] Manual backup failed with status ${res.status}`
                  }
                }));
                return new Response(JSON.stringify({ status: "error", message: "Supabase backup failed" }), { status: 500, headers: { 'Content-Type': 'application/json' }});
              } else {
                await env.CRM_BRIDGE_ROUTING_RULES.put('config:last_backup_timestamp', new Date().toISOString());
              }
"""

content = content.replace(
"""              if (!res.ok) {
                console.error("Failed to backup configs to Supabase:", res.status);
              }""",
"""              if (!res.ok) {
                console.error("Failed to backup configs to Supabase:", res.status);
                ctx.waitUntil(logTelemetry(env, {
                  telemetry_envelope: {
                    project_id: "AXIM_CRM_BRIDGE",
                    environment: env.ENVIRONMENT || "production",
                    timestamp: new Date().toISOString()
                  },
                  event_payload: {
                    event_type: "backup_sync_failed",
                    severity: "HIGH",
                    component_origin: "index.js",
                    error_message: `[SUPABASE_BACKUP_FAILED] Manual backup failed with status ${res.status}`
                  }
                }));
              } else {
                if (env.CRM_BRIDGE_ROUTING_RULES) {
                  await env.CRM_BRIDGE_ROUTING_RULES.put('config:last_backup_timestamp', new Date().toISOString());
                }
              }"""
)


content = content.replace(
"""          if (!res.ok) {
            console.error("Failed to backup configs to Supabase:", res.status);
            // Log telemetry error
            ctx.waitUntil(logTelemetry(env, {
              telemetry_envelope: {
                project_id: "AXIM_CRM_BRIDGE",
                environment: env.ENVIRONMENT || "production",
                timestamp: new Date().toISOString()
              },
              event_payload: {
                event_type: "backup_sync_failed",
                severity: "HIGH",
                component_origin: "index.js",
                error_message: `Supabase backup failed with status ${res.status}`
              }
            }));
          } else {
             ctx.waitUntil(logTelemetry(env, {
              telemetry_envelope: {
                project_id: "AXIM_CRM_BRIDGE",
                environment: env.ENVIRONMENT || "production",
                timestamp: new Date().toISOString()
              },
              event_payload: {
                event_type: "backup_sync_success",
                severity: "INFO",
                component_origin: "index.js",
                error_message: "Configs successfully backed up to Supabase"
              }
            }));
          }""",
"""          if (!res.ok) {
            console.error("Failed to backup configs to Supabase:", res.status);
            // Log telemetry error
            ctx.waitUntil(logTelemetry(env, {
              telemetry_envelope: {
                project_id: "AXIM_CRM_BRIDGE",
                environment: env.ENVIRONMENT || "production",
                timestamp: new Date().toISOString()
              },
              event_payload: {
                event_type: "backup_sync_failed",
                severity: "HIGH",
                component_origin: "index.js",
                error_message: `[SUPABASE_BACKUP_FAILED] Supabase backup failed with status ${res.status}`
              }
            }));
          } else {
            if (env.CRM_BRIDGE_ROUTING_RULES) {
              await env.CRM_BRIDGE_ROUTING_RULES.put('config:last_backup_timestamp', new Date().toISOString());
            }
             ctx.waitUntil(logTelemetry(env, {
              telemetry_envelope: {
                project_id: "AXIM_CRM_BRIDGE",
                environment: env.ENVIRONMENT || "production",
                timestamp: new Date().toISOString()
              },
              event_payload: {
                event_type: "backup_sync_success",
                severity: "INFO",
                component_origin: "index.js",
                error_message: "Configs successfully backed up to Supabase"
              }
            }));
          }"""
)


content = content.replace(
"""        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "backup_sync_failed",
            severity: "HIGH",
            component_origin: "index.js",
            error_message: `Supabase backup threw exception: ${err.message}`
          }
        }));""",
"""        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "backup_sync_failed",
            severity: "HIGH",
            component_origin: "index.js",
            error_message: `[SUPABASE_BACKUP_FAILED] Supabase backup threw exception: ${err.message}`
          }
        }));"""
)


# Also add error handling to the manual backup catch
content = content.replace(
"""          } catch (err) {
            console.error("Manual backup failed:", err);
          }
        })());

        return new Response(JSON.stringify({ status: "success", message: "Backup initiated." }), {""",
"""          } catch (err) {
            console.error("Manual backup failed:", err);
            ctx.waitUntil(logTelemetry(env, {
              telemetry_envelope: {
                project_id: "AXIM_CRM_BRIDGE",
                environment: env.ENVIRONMENT || "production",
                timestamp: new Date().toISOString()
              },
              event_payload: {
                event_type: "backup_sync_failed",
                severity: "HIGH",
                component_origin: "index.js",
                error_message: `[SUPABASE_BACKUP_FAILED] Manual backup threw exception: ${err.message}`
              }
            }));
          }
        })());

        return new Response(JSON.stringify({ status: "success", message: "Backup initiated." }), {"""
)



with open('src/index.js', 'w') as f:
    f.write(content)

print("Done")
