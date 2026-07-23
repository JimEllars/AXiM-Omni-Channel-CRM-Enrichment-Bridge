import re

with open('src/utils/enrichmentLogic.js', 'r') as f:
    content = f.read()

# Replace callCognitiveProxy function definition
old_func = """export async function callCognitiveProxy(env, ctx, payload) {
  // Use a hardcoded mock URL or actual if available
  const proxyUrl = env?.COGNITIVE_PROXY_URL || 'https://api.deepseek.com/v1/chat/completions';
  const apiKey = env?.DEEPSEEK_API_KEY || 'mock_key_for_sandbox';

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // Representing DeepSeek-V3
        messages: [
          {
            role: 'system',
            content: payload.discussion_context
              ? `You are an expert CRM data extractor. Format the following payload into our strict JSON schema. The user who uploaded this batch provided the following context to guide your extraction: ${payload.discussion_context}`
              : 'You are an AI data extractor. Extract structured information from the provided payload.'
          },
          { role: 'user', content: JSON.stringify(payload) }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Cognitive Proxy Error: ${response.status}`);
    }

    const data = await response.json();
    let extractedContent = data.choices[0].message.content;
    try {
        extractedContent = JSON.parse(extractedContent);

        if (typeof extractedContent === 'object' && extractedContent !== null) {
            extractedContent.metadata = {
                ...(extractedContent.metadata || {}),
                ai_enriched: true,
                enriched_at: new Date().toISOString()
            };

            // Increment KV counter for analytics
            if (env && env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
                ctx.waitUntil((async () => {
                    try {
                        const currentVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
                        const newVal = (currentVal ? parseInt(currentVal, 10) : 0) + 1;
                        await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:ai_rescues:total', newVal.toString());
                    } catch (e) {
                        console.error('Failed to increment ai_rescues counter:', e);
                    }
                })());
            }
        }
    } catch(e) { /* ignore parse errors */ }

    return extractedContent;
  } catch (error) {
    if (env && ctx) {
      ctx.waitUntil(logTelemetry(env, {
        telemetry_envelope: {
          project_id: "AXIM_CRM_BRIDGE",
          environment: env.ENVIRONMENT || "production",
          timestamp: new Date().toISOString()
        },
        event_payload: {
          event_type: "cognitive_proxy_fault",
          severity: "HIGH",
          component_origin: "enrichmentLogic.js",
          error_message: `Cognitive extraction failed: ${error.message}`
        }
      }));
    }
    throw error;
  }
}"""

new_func = """export async function callCognitiveProxy(env, ctx, payload) {
  if (env && env.AI) {
    try {
      const systemPrompt = payload.discussion_context
        ? `You are an expert CRM data extractor. Format the input payload into strict JSON with fields: firstName, lastName, company, email, phone, notes. Context: ${payload.discussion_context}`
        : 'You are an AI data extractor for an internal CRM. Filter, correct, and map the provided record into a strict CRM JSON schema.';

      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(payload) }
        ],
        response_format: { type: 'json_object' }
      });

      if (aiResponse && aiResponse.response) {
        let parsed = typeof aiResponse.response === 'string'
          ? JSON.parse(aiResponse.response)
          : aiResponse.response;

        parsed.metadata = {
          ...(parsed.metadata || {}),
          ai_enriched: true,
          provider: 'cloudflare_workers_ai',
          enriched_at: new Date().toISOString()
        };

        // Increment KV counter for analytics
        if (env && env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
            ctx.waitUntil((async () => {
                try {
                    const currentVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
                    const newVal = (currentVal ? parseInt(currentVal, 10) : 0) + 1;
                    await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:ai_rescues:total', newVal.toString());
                } catch (e) {
                    console.error('Failed to increment ai_rescues counter:', e);
                }
            })());
        }

        return parsed;
      }
    } catch (cfAiError) {
      console.warn('[WORKERS_AI_FALLBACK] Edge AI extraction failed. Falling back to HTTP proxy:', cfAiError.message);
    }
  }

  // Use a hardcoded mock URL or actual if available
  const proxyUrl = env?.COGNITIVE_PROXY_URL || 'https://api.deepseek.com/v1/chat/completions';
  const apiKey = env?.DEEPSEEK_API_KEY || 'mock_key_for_sandbox';

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // Representing DeepSeek-V3
        messages: [
          {
            role: 'system',
            content: payload.discussion_context
              ? `You are an expert CRM data extractor. Format the following payload into our strict JSON schema. The user who uploaded this batch provided the following context to guide your extraction: ${payload.discussion_context}`
              : 'You are an AI data extractor. Extract structured information from the provided payload.'
          },
          { role: 'user', content: JSON.stringify(payload) }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Cognitive Proxy Error: ${response.status}`);
    }

    const data = await response.json();
    let extractedContent = data.choices[0].message.content;
    try {
        extractedContent = JSON.parse(extractedContent);

        if (typeof extractedContent === 'object' && extractedContent !== null) {
            extractedContent.metadata = {
                ...(extractedContent.metadata || {}),
                ai_enriched: true,
                enriched_at: new Date().toISOString()
            };

            // Increment KV counter for analytics
            if (env && env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
                ctx.waitUntil((async () => {
                    try {
                        const currentVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
                        const newVal = (currentVal ? parseInt(currentVal, 10) : 0) + 1;
                        await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:ai_rescues:total', newVal.toString());
                    } catch (e) {
                        console.error('Failed to increment ai_rescues counter:', e);
                    }
                })());
            }
        }
    } catch(e) { /* ignore parse errors */ }

    return extractedContent;
  } catch (error) {
    if (env && ctx) {
      ctx.waitUntil(logTelemetry(env, {
        telemetry_envelope: {
          project_id: "AXIM_CRM_BRIDGE",
          environment: env.ENVIRONMENT || "production",
          timestamp: new Date().toISOString()
        },
        event_payload: {
          event_type: "cognitive_proxy_fault",
          severity: "HIGH",
          component_origin: "enrichmentLogic.js",
          error_message: `Cognitive extraction failed: ${error.message}`
        }
      }));
    }
    throw error;
  }
}"""

# Need to accurately escape template literals for regex sub? Better to just replace strings simply.
if old_func in content:
    content = content.replace(old_func, new_func)
    with open('src/utils/enrichmentLogic.js', 'w') as f:
        f.write(content)
    print("Replaced old function.")
else:
    print("Could not find old function precisely.")
