import { logTelemetry, logToRecovery } from './telemetry.js';

/**
 * Asynchronous Enrichment Service Layer
 * Evaluates a sanitized lead and determines if additional data gathering is required.
 */

const getApiKey = () => {
  if (typeof process !== 'undefined' && process.env && process.env.ENRICHMENT_API_KEY) {
    return process.env.ENRICHMENT_API_KEY;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ENRICHMENT_API_KEY) {
    return import.meta.env.VITE_ENRICHMENT_API_KEY;
  }
  return '';
};


// Real third-party API call with robust fetch, retries, exponential backoff, and 3-second timeout
async function thirdPartyEnrichment(env, ctx, provider, data) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('401 Unauthorized: ENRICHMENT_API_KEY is not defined');
  }

  let url;
  let method = 'GET';
  let body = null;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (provider.includes('clearbit')) {
    url = 'https://clearbit.com/v1/enrichment';
    method = 'POST';
    body = JSON.stringify({ email: data.email, domain: data.company });
  } else if (provider.includes('apollo')) {
    url = 'https://api.apollo.io/v1/people/match';
    method = 'POST';
    body = JSON.stringify({ first_name: data.first_name, last_name: data.last_name, organization_name: data.company });
  } else if (provider === 'linkedin') {
    url = 'https://api.linkedin.com/v2/people';
    method = 'GET';
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const retries = 3;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const fetchPromise = fetch(url, { method, headers, body });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: 3000ms')), 3000)
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (response.ok) {
        try {
          return await response.json();
        } catch (jsonErr) {
          if (env) {
            ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "enrichment_fault",
        severity: "HIGH",
        component_origin: "enrichmentLogic.js",
        error_message: `JSON_PARSE_ERROR: Failed to parse response from ${provider}`
      }
    }));
          }
          data._enrichment_failed = true;
          data._enrichment_error = `JSON_PARSE_ERROR: Failed to parse response from ${provider}`;
          return data;
        }
      }

      if (response.status === 429 && attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise(res => setTimeout(res, waitTime));
        continue;
      }

      throw new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      if (attempt === retries || (!error.message.includes('429') && !error.message.includes('Timeout') && !error.message.includes('fetch'))) {
        throw error;
      }
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise(res => setTimeout(res, waitTime));
    }
  }
}

export async function enrichRecord(env, ctx, record, pipelineConfig = null) {
  const startTime = Date.now();
  record._lineage = record._lineage || { processing_time_ms: 0, ai_provider: 'none', rules_applied: [] };
  let result = {
    ...record,
    enrichmentQueued: false,
    enrichmentActions: []
  };

  const pendingCalls = [];

  // Missing Email -> Clearbit Waterfall
  if (!result.email || result.email.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'FIND_EMAIL',
      provider: 'clearbit_waterfall',
      priority: 'high',
      status: 'pending',
      triggerCondition: 'MISSING_EMAIL'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
  }

  // Missing Phone -> Apollo Scraping Protocol
  if (!result.phone || result.phone.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'FIND_PHONE',
      provider: 'apollo_scraping_protocol',
      priority: 'high',
      status: 'pending',
      triggerCondition: 'MISSING_PHONE'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
  }

  // Check for missing company
  if (!result.company || result.company.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'SCRAPE_COMPANY',
      provider: 'linkedin',
      priority: 'medium',
      status: 'pending'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(thirdPartyEnrichment(env, ctx, action.provider, record));
  }


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


  if (pendingCalls.length > 0) {
    const results = await Promise.allSettled(pendingCalls);

    for (const res of results) {
      if (res.status === 'rejected') {
        result._enrichment_failed = true;
        result._enrichment_error = res.reason.message;
        if (env) {
          ctx.waitUntil(logTelemetry(env, {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
        timestamp: new Date().toISOString()
      },
      event_payload: {
        event_type: "enrichment_fault",
        severity: "HIGH",
        component_origin: "enrichmentLogic.js",
        error_message: `Enrichment failed: ${res.reason.message}`
      }
    }));
        }
        break; // Only need to flag once if any fail
      }
    }
  }

  result._lineage.processing_time_ms += (Date.now() - startTime);

  if (env && env.CRM_BRIDGE_ROUTING_RULES && ctx && ctx.waitUntil) {
    const latency = result._lineage.processing_time_ms;
    ctx.waitUntil((async () => {
      try {
        const currentAvgStr = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:performance:avg_latency_ms');
        let newAvg = latency;
        if (currentAvgStr) {
          const currentAvg = parseFloat(currentAvgStr);
          if (!isNaN(currentAvg)) {
             newAvg = currentAvg * 0.9 + latency * 0.1; // Simple Exponential Moving Average
          }
        }
        await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:performance:avg_latency_ms', newAvg.toString());
      } catch (err) {
        console.error("Failed to update avg_latency_ms", err);
      }
    })());
  }

  return result;
}

export async function callCognitiveProxy(env, ctx, payload) {
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

                    const edgeSuccess = await env.CRM_BRIDGE_ROUTING_RULES.get('analytics:edge_ai:success_count');
                    const newEdgeSuccess = (edgeSuccess ? parseInt(edgeSuccess, 10) : 0) + 1;
                    await env.CRM_BRIDGE_ROUTING_RULES.put('analytics:edge_ai:success_count', newEdgeSuccess.toString());
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
            extractedContent._lineage = payload._lineage || { processing_time_ms: 0, ai_provider: 'fallback_proxy', rules_applied: [] };
            extractedContent._lineage.ai_provider = 'fallback_proxy';
            extractedContent._lineage.rules_applied.push('COGNITIVE_PROXY_FALLBACK');


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
}

async function processSingleAgentRecord(env, ctx, record) {
  const extractedContent = await callCognitiveProxy(env, ctx, record);
  if (extractedContent && extractedContent.record) {
    return extractedContent.record;
  } else if (extractedContent) {
    // If there is no nested "record" object but top-level fields are returned
    return extractedContent;
  }
  throw new Error("Invalid format returned by cognitive proxy");
}

export async function processAgentBatch(env, ctx, payload) {
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
}
