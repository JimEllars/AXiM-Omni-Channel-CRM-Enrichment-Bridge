import re

with open("src/utils/mapper.js", "r") as f:
    content = f.read()

# Update mapper to retain/init _lineage
content = content.replace(
    "export function formatForDeskera(records) {\n  return records.map(record => {\n    // Basic mapping, adjusting keys to match target schema\n    const mapped = {",
    "export function formatForDeskera(records, pipelineConfig = null) {\n  return records.map(record => {\n    const _lineage = record._lineage || { processing_time_ms: 0, ai_provider: 'none', rules_applied: [] };\n    _lineage.rules_applied.push('MAPPER_DESKERA');\n    if (pipelineConfig) _lineage.rules_applied.push('DYNAMIC_PIPELINE_DESKERA');\n    const mapped = {\n      _lineage,"
)

content = content.replace(
    "export function formatForCore(records) {\n  return records.map(record => {\n    const mapped = {",
    "export function formatForCore(records, pipelineConfig = null) {\n  return records.map(record => {\n    const _lineage = record._lineage || { processing_time_ms: 0, ai_provider: 'none', rules_applied: [] };\n    _lineage.rules_applied.push('MAPPER_CORE');\n    if (pipelineConfig) _lineage.rules_applied.push('DYNAMIC_PIPELINE_CORE');\n    const mapped = {\n      _lineage,"
)

content = content.replace(
    "export function formatForUniversal(records) {\n  return records.map(record => {\n    const mapped = {",
    "export function formatForUniversal(records, pipelineConfig = null) {\n  return records.map(record => {\n    const _lineage = record._lineage || { processing_time_ms: 0, ai_provider: 'none', rules_applied: [] };\n    _lineage.rules_applied.push('MAPPER_UNIVERSAL');\n    if (pipelineConfig) _lineage.rules_applied.push('DYNAMIC_PIPELINE_UNIVERSAL');\n    const mapped = {\n      _lineage,"
)

with open("src/utils/mapper.js", "w") as f:
    f.write(content)
