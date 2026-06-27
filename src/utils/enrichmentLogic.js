
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

// Real third-party API call
async function thirdPartyEnrichment(provider, data) {
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
     // Mocking linkedin for now, as it requires a specific scraping setup, keeping the interface ready
    return { mock_enriched: true };
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const response = await fetch(url, { method, headers, body });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Timeout wrapper
function withTimeout(promise, ms) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms} ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export async function enrichRecord(record) {
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
    pendingCalls.push(withTimeout(thirdPartyEnrichment(action.provider, record), 4000));
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
    pendingCalls.push(withTimeout(thirdPartyEnrichment(action.provider, record), 4000));
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
    pendingCalls.push(withTimeout(thirdPartyEnrichment(action.provider, record), 4000));
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
    pendingCalls.push(withTimeout(thirdPartyEnrichment(action.provider, record), 4000));
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
      pendingCalls.push(withTimeout(thirdPartyEnrichment(action.provider, record), 4000));
  }

  if (pendingCalls.length > 0) {
    try {
      await Promise.all(pendingCalls);
      // In a real app we'd merge the actual results into the record
    } catch (e) {
      // Gracefully handle fail-open requirements
      result._enrichment_failed = true;
      result._enrichment_error = e.message;
    }
  }

  return result;
}
