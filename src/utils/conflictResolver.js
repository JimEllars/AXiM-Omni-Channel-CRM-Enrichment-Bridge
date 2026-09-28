import { telemetryClient } from './telemetry.js';
export const FIELD_AUTHORITY = {
  SUITEDASH: ['portal_status', 'client_billing_address', 'client_contacts'],
  DESKERA: ['tax_id', 'payment_terms', 'currency', 'invoice_balance'],
  NEXUS: ['enrichment_score', 'lead_status', 'assigned_rep', 'lifecycle_stage']
};

export function resolveConflict(existingRecord, incomingRecord, sourceSystem) {
  const start = Date.now();
  let decisions = 0;
  if (!existingRecord) return incomingRecord;

  const resolved = { ...existingRecord };
  const incomingSystem = sourceSystem.toUpperCase();

  // Combine all keys
  const allKeys = new Set([...Object.keys(existingRecord), ...Object.keys(incomingRecord)]);

  for (const key of allKeys) {
    if (!(key in incomingRecord)) continue;

    const isIncomingAuthoritative =
      (incomingSystem === 'SUITEDASH' && FIELD_AUTHORITY.SUITEDASH.includes(key)) ||
      (incomingSystem === 'DESKERA' && FIELD_AUTHORITY.DESKERA.includes(key)) ||
      (incomingSystem === 'NEXUS' && FIELD_AUTHORITY.NEXUS.includes(key));

    if (isIncomingAuthoritative) {
      resolved[key] = incomingRecord[key];
      decisions++;
      continue;
    }

    const isExistingAuthoritative =
      (!isIncomingAuthoritative && FIELD_AUTHORITY.SUITEDASH.includes(key) && existingRecord.source === 'SUITEDASH') ||
      (!isIncomingAuthoritative && FIELD_AUTHORITY.DESKERA.includes(key) && existingRecord.source === 'DESKERA') ||
      (!isIncomingAuthoritative && FIELD_AUTHORITY.NEXUS.includes(key) && existingRecord.source === 'NEXUS');

    if (isExistingAuthoritative) {
       continue;
    }

    // Timestamp check fallback
    const incomingTime = incomingRecord.updated_at ? new Date(incomingRecord.updated_at).getTime() : 0;
    const existingTime = existingRecord.updated_at ? new Date(existingRecord.updated_at).getTime() : 0;

    if (incomingTime > existingTime) {
      resolved[key] = incomingRecord[key];
      decisions++;
    } else if (incomingTime === existingTime) {
      // Tiebreak: Internal (NEXUS) wins
      if (incomingSystem === 'NEXUS') {
        resolved[key] = incomingRecord[key];
      decisions++;
      }
    }
  }

  // Preserve updated_at if appropriate
  resolved.updated_at = new Date().toISOString();

  telemetryClient.recordMetric('conflict.resolution.decisions', decisions, { sourceSystem });
  telemetryClient.recordMetric('conflict.resolution.duration_ms', Date.now() - start);

  return resolved;
}
