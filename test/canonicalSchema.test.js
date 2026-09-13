import { describe, it, expect } from 'vitest';
import { normalizeToCanonical, testExports } from '../src/models/canonicalSchema.js';

describe('canonicalSchema module', () => {
  it('normalizes email and phone', () => {
    const raw = {
      email: '  USER@DOMAIN.COM  ',
      phone: '(555) 123-4567',
      first_name: ' John ',
      last_name: ' Doe '
    };

    const canonical = normalizeToCanonical(raw, 'TEST');
    expect(canonical.primary_email).toBe('user@domain.com');
    expect(canonical.primary_phone).toBe('+15551234567');
    expect(canonical.first_name).toBe('John');
    expect(canonical.last_name).toBe('Doe');
  });

  it('computes consistent state hash', () => {
    const raw1 = { email: 'test@example.com', first_name: 'Test' };
    const raw2 = { first_name: 'Test', email: 'test@example.com' }; // Different key order

    const canonical1 = normalizeToCanonical(raw1, 'TEST');
    const canonical2 = normalizeToCanonical(raw2, 'TEST');

    expect(canonical1.state_hash).toBeDefined();
    expect(canonical1.state_hash).toBe(canonical2.state_hash);
  });

  it('extracts apex domains and filters webmail', () => {
    expect(testExports.extractApexDomain('user@company.com')).toBe('company.com');
    expect(testExports.extractApexDomain('user@gmail.com')).toBeNull();
  });

  it('enforces non-destructive invariant (removes nulls/empty strings)', () => {
      const raw = {
          email: 'valid@example.com',
          first_name: '',
          last_name: null,
          attributes: {
              custom1: 'value',
              custom2: '',
              custom3: null
          }
      };
      const canonical = normalizeToCanonical(raw, 'TEST');
      expect(canonical.primary_email).toBe('valid@example.com');
      expect(canonical.first_name).toBeUndefined();
      expect(canonical.last_name).toBeUndefined();
      expect(canonical.attributes.custom1).toBe('value');
      expect(canonical.attributes.custom2).toBeUndefined();
      expect(canonical.attributes.custom3).toBeUndefined();
  });
});
