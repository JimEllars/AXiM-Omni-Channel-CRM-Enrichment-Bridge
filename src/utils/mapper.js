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

    if (record.department === 'unifirst_sales') {
      mapped.target_crm = 'UniFirst';
      mapped.uniform_facility_opportunity = true;
    } else if (record.department === 'commercial_solar') {
      mapped.target_crm = 'JK_Renewables';
      if (record.facility_sqft !== undefined) {
        mapped.facility_sqft = record.facility_sqft;
      }
      if (record.solar_suitability !== undefined) {
        mapped.solar_suitability = record.solar_suitability;
      }
    } else if (record.department === 'support_c360') {
      mapped.target_crm = 'AXiM_Support_HUD';
      if (record.ticket_history_link !== undefined) {
        mapped.ticket_history_link = record.ticket_history_link;
      }
    }

    if (!mapped.emailAddress || mapped.emailAddress.trim() === '') {
      mapped._is_invalid = true;
      mapped._validation_reason = 'Critically missing Core-required field: emailAddress';
    }
    return mapped;
  });
}

export function formatForUniversal(records) {
  return records.map(record => {
    const mapped = {
      profile_id: record.id || record.profile_id || '',
      first_name: record.firstName || record.first_name || '',
      last_name: record.lastName || record.last_name || '',
      email: record.email || record.emailAddress || '',
      phone: record.phone || record.phoneNumber || '',
      organization: record.company || record.organization_name || record.organization || '',
      ecosystem_source: record.source || record.ecosystem_source || 'universal_ingress',
      raw_data: record._raw_data || record,
      _enrichment_status: record._enrichment_failed ? 'failed' : 'success'
    };

    if (!mapped.email || mapped.email.trim() === '') {
      mapped._is_invalid = true;
      mapped._validation_reason = 'Critically missing Universal Profile required field: email';
    }

    return mapped;
  });
}
