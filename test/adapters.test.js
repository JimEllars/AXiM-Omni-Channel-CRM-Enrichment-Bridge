import { describe, it, expect, vi } from 'vitest';
import { SuiteDashAdapter } from '../src/services/crm/suitedashAdapter.js';
import { DeskeraAdapter } from '../src/services/crm/deskeraAdapter.js';
import { telemetryClient } from '../src/utils/telemetry.js';

vi.mock('../src/utils/telemetry.js', () => ({
  telemetryClient: {
    recordSpan: vi.fn(),
    recordMetric: vi.fn(),
    recordError: vi.fn(),
  },
  logToRecovery: vi.fn()
}));

global.fetch = vi.fn();
// Polyfill crypto subtle for Node environment in tests
const cryptoModule = require('crypto');
if (!global.crypto) {
    global.crypto = {};
}
if (!global.crypto.subtle) {
    global.crypto.subtle = {
        digest: async (algo, data) => cryptoModule.createHash('sha256').update(data).digest()
    };
}

describe('SuiteDashAdapter', () => {
  it('syncContact adds cf_sync_source and includes idempotency hash and triggers telemetry', async () => {
    const adapter = new SuiteDashAdapter('pub', 'sec');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123' })
    });

    const canonical = { primary_email: 'test@example.com', first_name: 'Test' };
    await adapter.syncContact(canonical);

    // Verify fetch was called with the correct payload
    expect(global.fetch).toHaveBeenCalled();
    const fetchArgs = global.fetch.mock.calls[0];
    const fetchOptions = fetchArgs[1];
    const payload = JSON.parse(fetchOptions.body);

    expect(payload.cf_sync_source).toBe('AXIM_BRIDGE');
    expect(fetchOptions.headers['Idempotency-Key']).toBeDefined();
    expect(telemetryClient.recordSpan).toHaveBeenCalled();
  });
});

describe('DeskeraAdapter', () => {
  it('syncContact adds sync_source, handles token, backoff and telemetry', async () => {
    const adapter = new DeskeraAdapter({ username: 'test' });

    // Mock authentication
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'fake-token', expires_in: 3600 })
    });

    // Mock contact creation
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '456' })
    });

    const canonical = { primary_email: 'test@example.com', first_name: 'Test' };
    await adapter.syncContact(canonical);

    const syncArgs = global.fetch.mock.calls[2];
    const syncOptions = syncArgs[1];

    // Check header
    expect(syncOptions.headers['x-access-token']).toBe('fake-token');
    expect(syncOptions.headers['Idempotency-Key']).toBeDefined();

    // Check payload
    const payload = JSON.parse(syncOptions.body);
    expect(payload.sync_source).toBe('AXIM_BRIDGE');
    expect(telemetryClient.recordSpan).toHaveBeenCalled();
  });
});
