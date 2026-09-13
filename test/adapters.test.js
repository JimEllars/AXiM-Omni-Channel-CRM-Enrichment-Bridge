import { describe, it, expect, vi } from 'vitest';
import { SuiteDashAdapter } from '../src/services/crm/suitedashAdapter.js';
import { DeskeraAdapter } from '../src/services/crm/deskeraAdapter.js';

global.fetch = vi.fn();

describe('SuiteDashAdapter', () => {
  it('syncContact adds cf_sync_source', async () => {
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
  });
});

describe('DeskeraAdapter', () => {
  it('syncContact adds sync_source and handles token', async () => {
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

    // Should have called fetch twice (auth, then sync)
    expect(global.fetch).toHaveBeenCalledTimes(3); // +1 from SuiteDash test

    const syncArgs = global.fetch.mock.calls[2];
    const syncOptions = syncArgs[1];

    // Check header
    expect(syncOptions.headers['x-access-token']).toBe('fake-token');

    // Check payload
    const payload = JSON.parse(syncOptions.body);
    expect(payload.sync_source).toBe('AXIM_BRIDGE');
  });
});
