import re

with open("src/utils/enrichmentLogic.js", "r") as f:
    content = f.read()

# Add dynamic logic based on pipelineConfig to enrichRecord
# Replace the hardcoded workflow triggers with pipelineConfig-aware logic
target = """  // Check for missing LinkedIn URL
  if (!result.linkedin_url || result.linkedin_url.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'FETCH_SOCIAL',
      provider: 'clearbit_social',
      priority: 'medium',
      status: 'pending'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
  }

  // Check for missing company size (example of workflow trigger)
  if (!result.company_size) {
      result.enrichmentQueued = true;
      const action = {
          type: 'ENRICH_FIRMOGRAPHICS',
          provider: 'apollo_firmographics',
          priority: 'low',
          status: 'pending'
      };
      result.enrichmentActions.push(action);
      pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
  }"""

replacement = """
  // Dynamic Pipeline Hooks
  if (pipelineConfig && Array.isArray(pipelineConfig)) {
      // Find the Enrichment Hub step
      const enrichmentStep = pipelineConfig.find(step => step.name === 'Enrichment Hub');
      if (enrichmentStep && enrichmentStep.enabled) {
          result._lineage.rules_applied.push('DYNAMIC_ENRICHMENT_HUB_ENABLED');
          // Dynamic evaluation could happen here. For now we run default logic, but log it was dynamically allowed.

          if (!result.linkedin_url || result.linkedin_url.trim() === '') {
            result.enrichmentQueued = true;
            result._lineage.rules_applied.push('ENRICH_FETCH_SOCIAL');
            const action = { type: 'FETCH_SOCIAL', provider: 'clearbit_social', priority: 'medium', status: 'pending' };
            result.enrichmentActions.push(action);
            pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
          }

          if (!result.company_size) {
            result.enrichmentQueued = true;
            result._lineage.rules_applied.push('ENRICH_FIRMOGRAPHICS');
            const action = { type: 'ENRICH_FIRMOGRAPHICS', provider: 'apollo_firmographics', priority: 'low', status: 'pending' };
            result.enrichmentActions.push(action);
            pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
          }
      } else {
          result._lineage.rules_applied.push('DYNAMIC_ENRICHMENT_HUB_DISABLED');
      }
  } else {
      // Fallback to hardcoded logic if no dynamic pipeline config
      result._lineage.rules_applied.push('HARDCODED_ENRICHMENT_LOGIC');

      if (!result.linkedin_url || result.linkedin_url.trim() === '') {
        result.enrichmentQueued = true;
        result._lineage.rules_applied.push('ENRICH_FETCH_SOCIAL');
        const action = { type: 'FETCH_SOCIAL', provider: 'clearbit_social', priority: 'medium', status: 'pending' };
        result.enrichmentActions.push(action);
        pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
      }

      if (!result.company_size) {
          result.enrichmentQueued = true;
          result._lineage.rules_applied.push('ENRICH_FIRMOGRAPHICS');
          const action = { type: 'ENRICH_FIRMOGRAPHICS', provider: 'apollo_firmographics', priority: 'low', status: 'pending' };
          result.enrichmentActions.push(action);
          pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
      }
  }
"""

content = content.replace(target, replacement)

# Track ai_provider correctly in CognitiveProxy when parsed
content = content.replace(
    """        parsed.metadata = {
          ...(parsed.metadata || {}),
          ai_enriched: true,
          provider: 'cloudflare_workers_ai',
          ai_provider: 'llama-3.1-8b',
          enriched_at: new Date().toISOString()
        };""",
    """        parsed.metadata = {
          ...(parsed.metadata || {}),
          ai_enriched: true,
          provider: 'cloudflare_workers_ai',
          ai_provider: 'llama-3.1-8b',
          enriched_at: new Date().toISOString()
        };
        parsed._lineage = payload._lineage || { processing_time_ms: 0, ai_provider: 'llama-3.1-8b', rules_applied: [] };
        parsed._lineage.ai_provider = 'llama-3.1-8b';
        parsed._lineage.rules_applied.push('COGNITIVE_PROXY_LLAMA_3_1_8B');
"""
)

content = content.replace(
    """            extractedContent.metadata = {
                ...(extractedContent.metadata || {}),
                ai_enriched: true,
                ai_provider: 'fallback_proxy',
                enriched_at: new Date().toISOString()
            };""",
    """            extractedContent.metadata = {
                ...(extractedContent.metadata || {}),
                ai_enriched: true,
                ai_provider: 'fallback_proxy',
                enriched_at: new Date().toISOString()
            };
            extractedContent._lineage = payload._lineage || { processing_time_ms: 0, ai_provider: 'fallback_proxy', rules_applied: [] };
            extractedContent._lineage.ai_provider = 'fallback_proxy';
            extractedContent._lineage.rules_applied.push('COGNITIVE_PROXY_FALLBACK');
"""
)

with open("src/utils/enrichmentLogic.js", "w") as f:
    f.write(content)
