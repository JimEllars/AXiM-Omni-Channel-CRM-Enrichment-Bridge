import re

with open('src/utils/enrichmentLogic.js', 'r') as f:
    content = f.read()

# Replace processSingleAgentRecord
old_process_single = r"async function processSingleAgentRecord\(env, ctx, record\) \{.*?\n\s+throw new Error\(\"Invalid format returned by cognitive proxy\"\);\n\}"
new_process_single = """async function processSingleAgentRecord(env, ctx, record) {
  const extractedContent = await callCognitiveProxy(env, ctx, record);
  if (extractedContent && extractedContent.record) {
    return extractedContent.record;
  } else if (extractedContent) {
    // If there is no nested "record" object but top-level fields are returned
    return extractedContent;
  }
  throw new Error("Invalid format returned by cognitive proxy");
}"""

content = re.sub(old_process_single, new_process_single, content, flags=re.DOTALL)

# Replace processAgentBatch to handle payload as { records, strict_local_ai }
old_process_batch = r"export async function processAgentBatch\(env, ctx, payload\) \{.*?return processedRecords;\n\}"
new_process_batch = """export async function processAgentBatch(env, ctx, payload) {
  let records = [];
  let strict_local_ai = false;
  if (Array.isArray(payload)) {
      records = payload;
  } else if (payload && Array.isArray(payload.records)) {
      records = payload.records;
      strict_local_ai = !!payload.strict_local_ai;
  } else {
      return [];
  }

  const chunkSize = 10;
  const processedRecords = [];

  for (let i = 0; i < records.length; i += chunkSize) {
      let chunk = records.slice(i, i + chunkSize);

      let promises = chunk.map(record => {
          const augmentedRecord = { ...record, strict_local_ai };
          return processSingleAgentRecord(env, ctx, augmentedRecord);
      });
      let results = await Promise.allSettled(promises);

      results.forEach((result, index) => {
          const originalRecord = chunk[index];
          if (result.status === 'fulfilled') {
              processedRecords.push(result.value);
          } else {
              // Partial failure handling
              if (env && ctx) {
                  let errorReason = '[BATCH_PARTIAL_FAILURE]';
                  if (result.reason.message.includes('[EDGE_AI_UNAVAILABLE_STRICT_MODE]')) {
                      errorReason = '[EDGE_AI_UNAVAILABLE_STRICT_MODE]';
                  }
                  const failedRecordPayload = {
                      ...originalRecord,
                      _extraction_error: result.reason.message
                  };
                  ctx.waitUntil(logToRecovery(env, 'onyx_desktop_agent', errorReason, failedRecordPayload));
              }
          }
      });

      // Clean up local references strictly to assist V8 garbage collection
      chunk.length = 0;
      chunk = null;
      promises.length = 0;
      promises = null;
      results.length = 0;
      results = null;
  }

  return processedRecords;
}"""

content = re.sub(old_process_batch, new_process_batch, content, flags=re.DOTALL)

with open('src/utils/enrichmentLogic.js', 'w') as f:
    f.write(content)
