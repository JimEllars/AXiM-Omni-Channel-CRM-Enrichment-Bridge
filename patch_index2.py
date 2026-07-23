import re

with open('src/index.js', 'r') as f:
    content = f.read()

# Replace processAgentBatch call to include strict_local_ai
new_batch_process = """        ctx.waitUntil((async () => {
          try {
            // 1. Process batch using cognitive proxy
            const processedRecords = await processAgentBatch(env, ctx, { records, strict_local_ai: payload.strict_local_ai });"""

content = re.sub(
    r"        ctx\.waitUntil\(\(async \(\) => \{\n          try \{\n            // 1\. Process batch using cognitive proxy\n            const processedRecords = await processAgentBatch\(env, ctx, payload\);",
    new_batch_process,
    content
)

with open('src/index.js', 'w') as f:
    f.write(content)
