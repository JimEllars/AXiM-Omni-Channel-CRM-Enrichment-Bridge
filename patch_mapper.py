with open('src/utils/mapper.js', 'r') as f:
    content = f.read()

old_func = """export function formatForCore(records) {
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
}"""

new_func = """export function formatForCore(records) {
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
}"""

if old_func in content:
    content = content.replace(old_func, new_func)
    with open('src/utils/mapper.js', 'w') as f:
        f.write(content)
    print("Replaced old function.")
else:
    print("Could not find old function precisely.")
