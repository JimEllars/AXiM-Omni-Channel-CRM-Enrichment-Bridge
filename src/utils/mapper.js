/**
 * Maps standard lead records to Deskera CRM compatible format.
 */
export function formatForDeskera(records) {
  return records.map(record => {
    // Basic mapping, adjusting keys to match target schema
    const mapped = {
      first_name: record.firstName || record.first_name || '',
      last_name: record.lastName || record.last_name || '',
      email: record.email || '',
      phone: record.phone || '',
      // Nesting company data
      company: {
        name: record.company || record.organization_name || '',
        size: record.company_size || '',
        linkedin: record.linkedin_url || ''
      },
      source: record.source || 'api_ingress',
      _enrichment_status: record._enrichment_failed ? 'failed' : 'success'
    };


    // Pre-Flight Validation Check
    if (!mapped.email || mapped.email.trim() === '') {
      mapped._is_invalid = true;
      mapped._validation_reason = 'Critically missing CRM-required field: email';
    }

    return mapped;

  });
}
export function formatForCore(records) {
  return records.map(record => {
    const mapped = {
      id: record.id || '',
      firstName: record.firstName || record.first_name || '',
      lastName: record.lastName || record.last_name || '',
      emailAddress: record.email || '',
      phoneNumber: record.phone || '',
      organization: record.company || record.organization_name || '',
      source_system: record.source || 'api_ingress',
      enrichment_flag: record._enrichment_failed ? false : true
    };
    if (!mapped.emailAddress || mapped.emailAddress.trim() === '') {
      mapped._is_invalid = true;
      mapped._validation_reason = 'Critically missing Core-required field: emailAddress';
    }
    return mapped;
  });
}
