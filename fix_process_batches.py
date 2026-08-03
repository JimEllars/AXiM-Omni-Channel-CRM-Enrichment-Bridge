with open("src/index.js", "r") as f:
    content = f.read()

content = content.replace("async function processInBatches(env, source, rawRecords, ctx) {", "async function processInBatches(env, source, rawRecords, ctx, activePipeline = null) {")

with open("src/index.js", "w") as f:
    f.write(content)
