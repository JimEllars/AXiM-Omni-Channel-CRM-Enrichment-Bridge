import { describe, it, expect } from 'vitest';
import { resolveConflict } from '../src/utils/conflictResolver.js';

describe('conflictResolver', () => {
    it('should resolve conflicts based on authority', () => {
        const existingRecord = {
            id: '123',
            source: 'SUITEDASH',
            portal_status: 'Active',
            tax_id: '111',
            updated_at: '2023-01-01T00:00:00.000Z'
        };

        const incomingRecord = {
            portal_status: 'Inactive', // SuiteDash is authoritative, Deskera is not
            tax_id: '222', // Deskera is authoritative
            updated_at: '2023-01-02T00:00:00.000Z'
        };

        const resolved = resolveConflict(existingRecord, incomingRecord, 'DESKERA');

        // Since existing is SuiteDash and portal_status belongs to SuiteDash, keep existing.
        expect(resolved.portal_status).toBe('Active');

        // Since incoming is Deskera and tax_id belongs to Deskera, take incoming.
        expect(resolved.tax_id).toBe('222');
    });

    it('should fallback to timestamp if neither authoritative', () => {
        const existingRecord = {
            id: '123',
            source: 'SOME_SYSTEM',
            first_name: 'John',
            updated_at: '2023-01-01T00:00:00.000Z'
        };

        const incomingRecord = {
            first_name: 'Jonathan',
            updated_at: '2023-01-02T00:00:00.000Z'
        };

        const resolved = resolveConflict(existingRecord, incomingRecord, 'ANOTHER_SYSTEM');

        // Neither system is authoritative for first_name, incoming is newer
        expect(resolved.first_name).toBe('Jonathan');
    });
});
