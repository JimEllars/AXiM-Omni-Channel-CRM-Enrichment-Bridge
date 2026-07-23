import re

with open('src/utils/enrichmentLogic.js', 'r') as f:
    content = f.read()

# callCognitiveProxy updates
call_cog_proxy_regex = r"(export async function callCognitiveProxy\(env, ctx, payload\) \{)(.*?)(// Use a hardcoded mock URL or actual if available)"

def replacer_call_cog(match):
    prefix = match.group(1)
    body = match.group(2)
    suffix = match.group(3)

    # 1. Edge AI Success Telemetry
    body = body.replace(
        """// Increment KV counter for analytics
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
        }""",
        """// Increment KV counter for analytics
        if (env && env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
            ctx.waitUntil((async () => {
                try {
                    const currentVal = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:ai_rescues:total');
                    const newVal = (currentVal ? parseInt(currentVal, 10) : 0) + 1;
                    await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:ai_rescues:total', newVal.toString());

                    const edgeSuccess = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:success_count');
                    const newEdgeSuccess = (edgeSuccess ? parseInt(edgeSuccess, 10) : 0) + 1;
                    await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:edge_ai:success_count', newEdgeSuccess.toString());
                } catch (e) {
                    console.error('Failed to increment ai_rescues counter:', e);
                }
            })());
        }"""
    )

    return prefix + body + suffix

content = re.sub(call_cog_proxy_regex, replacer_call_cog, content, flags=re.DOTALL)

# Fallback telemetry + strict local AI
fallback_regex = r"(\} catch \(cfAiError\) \{\n\s+console\.warn\('\[WORKERS_AI_FALLBACK\] Edge AI extraction failed\. Falling back to HTTP proxy:', cfAiError\.message\);\n\s+\}\n\s+\})"

def replacer_fallback(match):
    return """} catch (cfAiError) {
      console.warn('[WORKERS_AI_FALLBACK] Edge AI extraction failed. Falling back to HTTP proxy:', cfAiError.message);
    }
  }

  // Increment fallback counter and enforce strict mode if enabled
  if (env && env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
      ctx.waitUntil((async () => {
          try {
              const edgeFallback = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:fallback_count');
              const newEdgeFallback = (edgeFallback ? parseInt(edgeFallback, 10) : 0) + 1;
              await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:edge_ai:fallback_count', newEdgeFallback.toString());
          } catch (e) {
              console.error('Failed to increment fallback counter:', e);
          }
      })());
  }

  if (payload.strict_local_ai) {
      throw new Error("[EDGE_AI_UNAVAILABLE_STRICT_MODE]");
  }"""

content = re.sub(fallback_regex, replacer_fallback, content, flags=re.DOTALL)

with open('src/utils/enrichmentLogic.js', 'w') as f:
    f.write(content)
