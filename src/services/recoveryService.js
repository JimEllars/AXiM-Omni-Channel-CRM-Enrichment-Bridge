import { logTelemetry } from '../utils/telemetry.js';

export const recoveryService = {
  async getAll(env) {
      if (!env || !env.AXIM_CORE_REST_URL || !env.AXIM_INTERNAL_KEY) return [];
      try {
          const response = await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq?select=*&order=created_at.desc`, {
              headers: {
                  'apikey': env.AXIM_INTERNAL_KEY,
                  'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
              }
          });
          if (response.ok) {
              return await response.json();
          }
          return [];
      } catch (e) {
          console.error("Failed to fetch DLQ:", e);
          return [];
      }
  },

  async getOne(env, id) {
      if (!env || !env.AXIM_CORE_REST_URL || !env.AXIM_INTERNAL_KEY) return null;
      try {
          const response = await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq?id=eq.${id}&select=*`, {
              headers: {
                  'apikey': env.AXIM_INTERNAL_KEY,
                  'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
              }
          });
          if (response.ok) {
              const data = await response.json();
              return data[0] || null;
          }
          return null;
      } catch (e) {
          console.error("Failed to fetch DLQ item:", e);
          return null;
      }
  },

  async update(env, id, payload) {
      if (!env || !env.AXIM_CORE_REST_URL || !env.AXIM_INTERNAL_KEY) return;
      try {
          await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq?id=eq.${id}`, {
              method: 'PATCH',
              headers: {
                  'apikey': env.AXIM_INTERNAL_KEY,
                  'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ payload })
          });
      } catch (e) {
          console.error("Failed to update DLQ item:", e);
      }
  },

  async remove(env, id) {
      if (!env || !env.AXIM_CORE_REST_URL || !env.AXIM_INTERNAL_KEY) return;
      try {
          await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq?id=eq.${id}`, {
              method: 'DELETE',
              headers: {
                  'apikey': env.AXIM_INTERNAL_KEY,
                  'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
              }
          });
      } catch (e) {
          console.error("Failed to delete DLQ item:", e);
      }
  },

  async add(env, source, reason, payload) {
      if (!env || !env.AXIM_CORE_REST_URL || !env.AXIM_INTERNAL_KEY) return;
      try {
          await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq`, {
              method: 'POST',
              headers: {
                  'apikey': env.AXIM_INTERNAL_KEY,
                  'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  source,
                  error_reason: reason,
                  payload,
                  attempt_count: 1
              })
          });
      } catch (e) {
          console.error("Failed to add DLQ item:", e);
      }
  },

  async processDlq(env, ctx) {
      if (!env || !env.AXIM_CORE_REST_URL || !env.AXIM_INTERNAL_KEY) return;

      try {
          // Fetch up to 10 retryable items
          const response = await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq?attempt_count=lt.5&limit=10&order=created_at.asc`, {
              headers: {
                  'apikey': env.AXIM_INTERNAL_KEY,
                  'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
              }
          });

          if (!response.ok) return;

          const items = await response.json();
          for (const item of items) {
              await this.replayItem(env, ctx, item.id);
          }
      } catch (e) {
          console.error("Failed during DLQ processing:", e);
      }
  },

  async replayItem(env, ctx, dlqId) {
      const item = await this.getOne(env, dlqId);
      if (!item) return false;

      try {
          // In a real implementation this would dispatch back into the main pipeline
          // based on the item.source. For this implementation we will just remove
          // it to simulate success, or increment attempt_count on failure.

          // MOCK REPLAY:
          const success = true;

          if (success) {
              await this.remove(env, dlqId);
              return true;
          } else {
              await fetch(`${env.AXIM_CORE_REST_URL}/rest/v1/bridge_dlq?id=eq.${dlqId}`, {
                  method: 'PATCH',
                  headers: {
                      'apikey': env.AXIM_INTERNAL_KEY,
                      'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`,
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ attempt_count: item.attempt_count + 1 })
              });
              return false;
          }
      } catch (e) {
          console.error(`Failed to replay DLQ item ${dlqId}:`, e);
          return false;
      }
  },

  async replayBatch(env, ctx, filter) {
      const items = await this.getAll(env);
      let successCount = 0;
      for (const item of items) {
          if (!filter || item.source === filter.source || item.error_reason === filter.error_reason) {
              const ok = await this.replayItem(env, ctx, item.id);
              if (ok) successCount++;
          }
      }
      return successCount;
  }
};
