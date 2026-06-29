import { logTelemetry } from './telemetry.js';

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
async function thirdPartyEnrichment(env, provider, data) {
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
            await logTelemetry(env, 'ENRICHMENT_FAULT', 'HIGH', `JSON_PARSE_ERROR: Failed to parse response from ${provider}`);
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

export async function enrichRecord(env, record) {
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
    pendingCalls.push(thirdPartyEnrichment(env, action.provider, record));
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
    pendingCalls.push(thirdPartyEnrichment(env, action.provider, record));
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
    pendingCalls.push(thirdPartyEnrichment(env, action.provider, record));
  }

  // Check for missing LinkedIn URL
  if (!result.linkedin_url || result.linkedin_url.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'FETCH_SOCIAL',
      provider: 'clearbit_social',
      priority: 'medium',
      status: 'pending'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(thirdPartyEnrichment(env, action.provider, record));
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
      pendingCalls.push(thirdPartyEnrichment(env, action.provider, record));
  }

  if (pendingCalls.length > 0) {
    const results = await Promise.allSettled(pendingCalls);

    for (const res of results) {
      if (res.status === 'rejected') {
        result._enrichment_failed = true;
        result._enrichment_error = res.reason.message;
        if (env) {
          await logTelemetry(env, 'ENRICHMENT_FAULT', 'HIGH', `Enrichment failed: ${res.reason.message}`);
        }
        break; // Only need to flag once if any fail
      }
    }
  }

  return result;
}
