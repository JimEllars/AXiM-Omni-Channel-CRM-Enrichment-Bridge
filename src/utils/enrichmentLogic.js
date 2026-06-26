/**
 * Asynchronous Enrichment Service Layer
 * Evaluates a sanitized lead and determines if additional data gathering is required.
 */

// Mock third-party API call
async function mockThirdPartyEnrichment(provider, data) {
  // Randomized jitter to avoid self-DDoS / rate limiting
  const jitter = Math.random() * 1500;
  await new Promise(resolve => setTimeout(resolve, jitter));

  return new Promise((resolve, reject) => {
    // Randomly fail or succeed for mock
    const willFail = Math.random() > 0.8;
    setTimeout(() => {
      if (willFail) {
        reject(new Error(`${provider} API timeout/failure`));
      } else {
        resolve({ mock_enriched: true });
      }
    }, Math.random() * 2000 + 500); // 500ms - 2500ms
  });
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
      provider: 'clearbit_waterfall_mock',
      priority: 'high',
      status: 'pending',
      triggerCondition: 'MISSING_EMAIL'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(withTimeout(mockThirdPartyEnrichment(action.provider, record), 4000));
  }

  // Missing Phone -> Apollo Scraping Protocol
  if (!result.phone || result.phone.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'FIND_PHONE',
      provider: 'apollo_scraping_protocol_mock',
      priority: 'high',
      status: 'pending',
      triggerCondition: 'MISSING_PHONE'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(withTimeout(mockThirdPartyEnrichment(action.provider, record), 4000));
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
    pendingCalls.push(withTimeout(mockThirdPartyEnrichment(action.provider, record), 4000));
  }

  // Check for missing LinkedIn URL
  if (!result.linkedin_url || result.linkedin_url.trim() === '') {
    result.enrichmentQueued = true;
    const action = {
      type: 'FETCH_SOCIAL',
      provider: 'clearbit_mock',
      priority: 'medium',
      status: 'pending'
    };
    result.enrichmentActions.push(action);
    pendingCalls.push(withTimeout(mockThirdPartyEnrichment(action.provider, record), 4000));
  }

  // Check for missing company size (example of workflow trigger)
  if (!result.company_size) {
      result.enrichmentQueued = true;
      const action = {
          type: 'ENRICH_FIRMOGRAPHICS',
          provider: 'apollo_mock',
          priority: 'low',
          status: 'pending'
      };
      result.enrichmentActions.push(action);
      pendingCalls.push(withTimeout(mockThirdPartyEnrichment(action.provider, record), 4000));
  }

  if (pendingCalls.length > 0) {
    try {
      await Promise.all(pendingCalls);
      // In a real app we'd merge the mock results into the record
    } catch (e) {
      // Gracefully handle fail-open requirements
      result._enrichment_failed = true;
      result._enrichment_error = e.message;
    }
  }

  return result;
}
