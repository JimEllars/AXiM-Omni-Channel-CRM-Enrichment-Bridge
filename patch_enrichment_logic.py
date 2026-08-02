import re

with open("src/utils/enrichmentLogic.js", "r") as f:
    content = f.read()

# We need to change enrichRecord signature to include pipelineConfig
content = content.replace(
    "export async function enrichRecord(env, ctx, record) {",
    "export async function enrichRecord(env, ctx, record, pipelineConfig = null) {\n  const startTime = Date.now();\n  record._lineage = record._lineage || { processing_time_ms: 0, ai_provider: 'none', rules_applied: [] };"
)

# And inside callCognitiveProxy, track ai_provider
# For cloudflare_workers_ai
content = content.replace(
    "provider: 'cloudflare_workers_ai',",
    "provider: 'cloudflare_workers_ai',\n          ai_provider: 'llama-3.1-8b',"
)

content = content.replace(
    "ai_enriched: true,",
    "ai_enriched: true,\n                ai_provider: 'fallback_proxy',"
)

# Also update the end of enrichRecord to calculate processing time
# Find the return result; line at the very end of enrichRecord.
# It's at the end of the if (pendingCalls.length > 0) block.
content = content.replace(
    "  return result;\n}",
    "  result._lineage.processing_time_ms += (Date.now() - startTime);\n  return result;\n}"
)

with open("src/utils/enrichmentLogic.js", "w") as f:
    f.write(content)
