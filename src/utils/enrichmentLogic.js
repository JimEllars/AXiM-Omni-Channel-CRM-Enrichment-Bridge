/**
 * Asynchronous Enrichment Service Layer
 * Evaluates a sanitized lead and determines if additional data gathering is required.
 */

export function enrichRecord(record) {
  const result = {
    ...record,
    enrichmentQueued: false,
    enrichmentActions: []
  };

  // Check for missing company
  if (!result.company || result.company.trim() === '') {
    result.enrichmentQueued = true;
    result.enrichmentActions.push({
      type: 'SCRAPE_COMPANY',
      provider: 'linkedin',
      priority: 'high',
      status: 'pending'
    });
  }

  // Check for missing LinkedIn URL
  if (!result.linkedin_url || result.linkedin_url.trim() === '') {
    result.enrichmentQueued = true;
    result.enrichmentActions.push({
      type: 'FETCH_SOCIAL',
      provider: 'clearbit_mock',
      priority: 'medium',
      status: 'pending'
    });
  }

  // Check for missing company size (example of workflow trigger)
  if (!result.company_size) {
      result.enrichmentQueued = true;
      result.enrichmentActions.push({
          type: 'ENRICH_FIRMOGRAPHICS',
          provider: 'apollo_mock',
          priority: 'low',
          status: 'pending'
      });
  }

  return result;
}
