import { ensureTab, getRows, appendRow, deleteRow, updateRow, findRowIndexById } from '../lib/googleSheets';

const TAB = 'Sources';
const HEADERS = ['id', 'name', 'type', 'icon', 'status', 'count', 'created_at', 'updated_at'];

export const sourceService = {
  async getAll() {
    await ensureTab(TAB, HEADERS);
    const rows = await getRows(`${TAB}!A2:H`);
    return rows.map(row => ({
      id: row[0],
      name: row[1],
      type: row[2],
      icon: row[3],
      status: row[4],
      count: parseInt(row[5] || 0),
      created_at: row[6],
      updated_at: row[7]
    }));
  },

  async add(source) {
    await ensureTab(TAB, HEADERS);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newRow = [id, source.name, source.type, source.icon, 'Active', 0, now, now];
    await appendRow(`${TAB}!A:H`, newRow);
    return { id, ...source, status: 'Active', count: 0, created_at: now, updated_at: now };
  },

  async delete(id) {
    return deleteRow(TAB, id);
  },


  async replayFailedOutbound(env, records) {
    // Process in chunks of 5
    const chunkSize = 5;
    let successCount = 0;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);

      await Promise.all(chunk.map(async (record) => {
        try {
          let recordPayload = typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload;

          if (!recordPayload || !recordPayload.target_url) {
            console.warn(`Record ${record.id} missing target_url in payload.`);
            return;
          }

          const response = await fetch(recordPayload.target_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(recordPayload.original_payload)
          });

          if (response.ok) {
            const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
            const dlqEndpoint = `${coreRestUrl}/rest/v1/dlq_records?id=eq.${record.id}`;

            await fetch(dlqEndpoint, {
              method: 'DELETE',
              headers: {
                'apikey': env.AXIM_INTERNAL_KEY,
                'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
              }
            });
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to replay record ${record.id}:`, error.message);
        }
      }));
    }
    return successCount;
  },

  async dispatchEcosystemBroadcast(env, ctx, payload) {
    if (!ctx || !ctx.waitUntil) {
      console.warn('dispatchEcosystemBroadcast called without valid ctx');
    }

    const broadcastPromise = (async () => {
      try {
        let subscribers = [];
        if (env.CRM_BRIDGE_ROUTING_RULES) {
            const subsStr = await env.CRM_BRIDGE_ROUTING_RULES.get('config:ecosystem_subscribers');
            if (subsStr) {
                subscribers = JSON.parse(subsStr);
            }
        }

        if (!Array.isArray(subscribers) || subscribers.length === 0) {
            return; // No subscribers
        }

        const requests = subscribers.map(url => {
            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }).then(res => {
                if (!res.ok) {
                    throw { error: new Error(`HTTP ${res.status}`), url };
                }
                return { res, url };
            }).catch(err => {
                throw { error: err, url };
            });
        });

        const results = await Promise.allSettled(requests);

        const failures = results.filter(r => r.status === 'rejected');
        const successes = results.filter(r => r.status === 'fulfilled');

        if (env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
            ctx.waitUntil((async () => {
                try {
                    if (failures.length > 0) {
                        const failVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:broadcast:failed');
                        const newFail = (failVal ? parseInt(failVal, 10) : 0) + failures.length;
                        await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:broadcast:failed', newFail.toString());
                    }
                    if (successes.length > 0) {
                        const succVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:broadcast:success');
                        const newSucc = (succVal ? parseInt(succVal, 10) : 0) + successes.length;
                        await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:broadcast:success', newSucc.toString());
                    }
                } catch (e) {
                    console.error('Failed to update broadcast metrics:', e);
                }
            })());
        }

        if (failures.length > 0) {
            console.error(`${failures.length} ecosystem broadcast(s) failed`);

            const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
            const dlqEndpoint = `${coreRestUrl}/rest/v1/dlq_records`;

            failures.forEach(failure => {
                const targetUrl = failure.reason && failure.reason.url ? failure.reason.url : 'unknown_subscriber';
                const errorReason = failure.reason && failure.reason.error ? failure.reason.error.message : 'Unknown Network Error';

                if (ctx && ctx.waitUntil) {
                    ctx.waitUntil((async () => {
                        try {
                            const dlqPayload = {
                                source: 'ecosystem_broadcast',
                                error_reason: '[BROADCAST_SYNC_FAILED]',
                                payload: JSON.stringify({
                                    original_payload: payload,
                                    target_url: targetUrl,
                                    error_detail: errorReason,
                                    destination: 'ecosystem_subscriber'
                                })
                            };
                            await fetch(dlqEndpoint, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': env.AXIM_INTERNAL_KEY,
                                    'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
                                },
                                body: JSON.stringify(dlqPayload)
                            });
                        } catch (dlqError) {
                            console.error("Failed to write to DLQ for broadcast failure:", dlqError);
                        }
                    })());
                }
            });
        }
      } catch (error) {
        console.error('Ecosystem broadcast loop failed:', error.message);
      }
    })();

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(broadcastPromise);
    } else {
      await broadcastPromise;
    }
  },

  async dispatchOutboundWebhook(env, ctx, targetUrl, payload, destinationName = 'Unknown') {
    if (!ctx || !ctx.waitUntil) {
      console.warn('dispatchOutboundWebhook called without valid ctx');
    }

    const dispatchPromise = (async () => {
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Outbound sync failed with status: ${response.status}`);
        }

        if (!response.ok) {
           console.warn(`Outbound sync returned non-success status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Outbound dispatch failed to ${destinationName}:`, error.message);

        const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
        const dlqEndpoint = `${coreRestUrl}/rest/v1/dlq_records`;

        try {
          const dlqPayload = {
             source: 'outbound_dispatcher',
             error_reason: '[OUTBOUND_SYNC_FAILED]',
             payload: JSON.stringify({
                original_payload: payload,
                target_url: targetUrl,
                destination: destinationName,
                target_crm: destinationName
             })
          };

          await fetch(dlqEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.AXIM_INTERNAL_KEY,
              'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
            },
            body: JSON.stringify(dlqPayload)
          });
        } catch (dlqError) {
           console.error("Failed to write to DLQ for outbound failure:", dlqError);
        }
      }
    })();

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(dispatchPromise);
    } else {
      await dispatchPromise;
    }
  }
};