import { logTelemetry } from '../utils/telemetry.js';
import { callCognitiveProxy } from '../utils/enrichmentLogic.js';

export const nexusService = {
  async fetchOutdatedRecords(env, ctx, limit = 50) {
    if (!env.NEXUS_CRM_URL || !env.NEXUS_CRM_API_KEY) {
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "nexus_sync_skipped",
            severity: "INFO",
            component_origin: "nexusService.js",
            error_message: "[NEXUS_SYNC_SKIPPED] NEXUS_CRM_URL or NEXUS_CRM_API_KEY not configured."
          }
        }));
      }
      return [];
    }

    try {
      const response = await fetch(`${env.NEXUS_CRM_URL}/api/records/outdated?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${env.NEXUS_CRM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch outdated records: ${response.status}`);
      }

      const data = await response.json();
      return data.records || [];
    } catch (e) {
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "nexus_fetch_fault",
            severity: "WARN",
            component_origin: "nexusService.js",
            error_message: `Nexus CRM unreachable or error fetching: ${e.message}`
          }
        }));
      }
      return [];
    }
  },

  async pushEnrichedRecord(env, ctx, recordId, enrichedData) {
    if (!env.NEXUS_CRM_URL || !env.NEXUS_CRM_API_KEY) {
      return false;
    }

    try {
      const response = await fetch(`${env.NEXUS_CRM_URL}/api/records/${recordId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${env.NEXUS_CRM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(enrichedData)
      });

      if (!response.ok) {
        throw new Error(`Failed to push record ${recordId}: ${response.status}`);
      }
      return true;
    } catch (e) {
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "nexus_push_fault",
            severity: "WARN",
            component_origin: "nexusService.js",
            error_message: `Nexus CRM error pushing record ${recordId}: ${e.message}`
          }
        }));
      }
      return false;
    }
  },

  async runDailyEnrichmentSweep(env, ctx) {
    if (!env.NEXUS_CRM_URL || !env.NEXUS_CRM_API_KEY) {
       ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "nexus_sync_skipped",
            severity: "INFO",
            component_origin: "nexusService.js",
            error_message: "[NEXUS_SYNC_SKIPPED] Credentials missing. Exiting cleanly."
          }
       }));
       return;
    }

    ctx.waitUntil((async () => {
      try {
        const records = await this.fetchOutdatedRecords(env, ctx, 50);

        let processed = 0;
        let enriched = 0;

        for (const record of records) {
          processed++;
          try {
            // Transform for cognitive proxy
            const payload = {
              ...record,
              discussion_context: "Internal daily cleanup sweep. Normalize and extract data."
            };

            const enrichedData = await callCognitiveProxy(env, ctx, payload);

            if (enrichedData) {
               const success = await this.pushEnrichedRecord(env, ctx, record.id, enrichedData);
               if (success) {
                 enriched++;
               }
            }
          } catch (e) {
            console.error(`Error enriching record ${record.id}:`, e);
          }
        }

        // Track telemetry in KV
        if (env.CRM_BRIDGE_ROUTING_RULES) {
           const timestamp = new Date().toISOString();
           await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:nexus_daily:processed', processed.toString());
           await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:nexus_daily:enriched', enriched.toString());
           await env.CRM_BRIDGE_ROUTING_RULES.put('config:last_nexus_sweep_timestamp', timestamp);
        }

      } catch (e) {
        ctx.waitUntil(logTelemetry(env, {
          telemetry_envelope: {
            project_id: "AXIM_CRM_BRIDGE",
            environment: env.ENVIRONMENT || "production",
            timestamp: new Date().toISOString()
          },
          event_payload: {
            event_type: "nexus_sweep_fault",
            severity: "HIGH",
            component_origin: "nexusService.js",
            error_message: `Nexus daily sweep failed: ${e.message}`
          }
        }));
      }
    })());
  }
};
