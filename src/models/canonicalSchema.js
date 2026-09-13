import crypto from 'crypto';

/**
 * Strips whitespace and lowercases email addresses.
 */
function normalizeEmail(email) {
  if (!email) return email;
  return email.trim().toLowerCase();
}

/**
 * Formats phone numbers to E.164 standard.
 * Basic implementation: removes all non-digit characters and prepends '+'.
 * Can be improved with library like 'libphonenumber-js' later if needed.
 */
function normalizePhone(phone) {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // If no country code, assume US (+1) for this basic implementation if length is 10
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return `+${digits}`;
}

/**
 * Computes deterministic SHA-256 state_hash across invariant fields.
 */
function computeStateHash(payload) {
  if (!payload) return null;
  // Sort keys to ensure consistent hashing
  const sortedKeys = Object.keys(payload).sort();
  const normalizedObj = {};
  for (const key of sortedKeys) {
    normalizedObj[key] = payload[key];
  }
  return crypto.createHash('sha256').update(JSON.stringify(normalizedObj)).digest('hex');
}

/**
 * Extracts apex corporate web domains (filtering webmail).
 */
function extractApexDomain(email) {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();

  const webmailDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'me.com', 'mac.com'
  ];

  if (webmailDomains.includes(domain)) {
    return null;
  }
  return domain;
}

/**
 * Normalizes raw data to canonical format.
 * Enforces the Non-Destructive Invariant: inbound null or empty string attributes are stripped.
 */
export function normalizeToCanonical(rawData, sourceSystem) {
  if (!rawData) return null;

  const normalized = {};

  // Map and normalize fields
  if (rawData.email && rawData.email.trim() !== '') {
    normalized.primary_email = normalizeEmail(rawData.email);
  }

  if (rawData.phone && rawData.phone.trim() !== '') {
    normalized.primary_phone = normalizePhone(rawData.phone);
  }

  if (rawData.first_name && rawData.first_name.trim() !== '') {
    normalized.first_name = rawData.first_name.trim();
  }

  if (rawData.last_name && rawData.last_name.trim() !== '') {
    normalized.last_name = rawData.last_name.trim();
  }

  if (rawData.legal_name && rawData.legal_name.trim() !== '') {
    normalized.legal_name = rawData.legal_name.trim();
  }

  // Handle apex domain extraction if email is present and domain isn't explicitly provided
  if (normalized.primary_email && !normalized.domain) {
    const domain = extractApexDomain(normalized.primary_email);
    if (domain) {
      normalized.attributes = normalized.attributes || {};
      normalized.attributes.domain = domain;
    }
  }

  // Preserve non-null attributes
  if (rawData.attributes && typeof rawData.attributes === 'object') {
    normalized.attributes = normalized.attributes || {};
    for (const [key, value] of Object.entries(rawData.attributes)) {
      if (value !== null && value !== '') {
         normalized.attributes[key] = value;
      }
    }
    if (Object.keys(normalized.attributes).length === 0) {
      delete normalized.attributes;
    }
  }

  if (rawData.entity_type) {
    normalized.entity_type = rawData.entity_type;
  }

  // Compute state hash
  normalized.state_hash = computeStateHash(normalized);

  return normalized;
}

// For testing purposes
export const testExports = {
  normalizeEmail,
  normalizePhone,
  computeStateHash,
  extractApexDomain
};
