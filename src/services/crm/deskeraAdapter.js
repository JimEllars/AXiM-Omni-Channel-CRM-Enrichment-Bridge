import { telemetryClient, logToRecovery } from '../../utils/telemetry.js';

// Simple hash function for idempotency key
const hashString = async (str) => {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export class DeskeraAdapter {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = 'https://api.deskera.com';
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async _authenticate() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 600000) {
      return;
    }

    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/iam/auth/sign-in/web/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.credentials)
      });

      telemetryClient.recordSpan('Deskera_Auth', Date.now() - start, { status: response.status });

      if (!response.ok) {
        throw new Error(`Deskera Auth Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.token = data.access_token || data.token;
      const expiresIn = data.expires_in ? data.expires_in * 1000 : 3600 * 1000;
      this.tokenExpiresAt = now + expiresIn;
    } catch (error) {
      telemetryClient.recordError({ context: 'DeskeraAuth' }, error);
      console.error('Deskera authentication failed:', error);
      throw error;
    }
  }

  async _request(method, endpoint, body = null, idempotencyKey = null) {
    await this._authenticate();

    const headers = {
      'x-access-token': this.token,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);

      telemetryClient.recordSpan(`Deskera_${method}`, Date.now() - start, {
        endpoint,
        status: response.status
      });

      if (!response.ok) {
         throw new Error(`Deskera API Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      telemetryClient.recordError({ context: `Deskera_${method}`, endpoint }, error);
      throw error;
    }
  }

  async syncContact(canonicalContact) {
    const updateTimestamp = canonicalContact.updated_at || new Date().toISOString();
    const contactId = canonicalContact.id || canonicalContact.primary_email;
    const idempotencyKey = await hashString(`${contactId}-${updateTimestamp}`);

    const payload = {
      ...canonicalContact,
      sync_source: 'AXIM_BRIDGE'
    };

    const start = Date.now();
    try {
      const response = await this._request('POST', '/v1/contact', payload, idempotencyKey);

      telemetryClient.recordMetric('deskera.sync_contact.success', 1, {
         contact_id: contactId
      });
      telemetryClient.recordSpan('Deskera_SyncContact', Date.now() - start, {
        status: response.status,
        has_id: !!canonicalContact.id
      });

      return await response.json();
    } catch (error) {
      telemetryClient.recordMetric('deskera.sync_contact.error', 1, {
         contact_id: contactId
      });
      telemetryClient.recordSpan('Deskera_SyncContact', Date.now() - start, {
        error: error.message
      });
      console.error('Error syncing contact to Deskera:', error);

      // Route failed sync to recovery
      logToRecovery({}, 'DeskeraAdapter', error.message, canonicalContact);

      throw error;
    }
  }

  async mapCustomDimensions(dimensions) {
    const start = Date.now();
    try {
      const response = await this._request('POST', '/v1/dimension', dimensions);

      telemetryClient.recordSpan('Deskera_MapDimensions', Date.now() - start, {
        dimension_count: Object.keys(dimensions || {}).length,
        status: response.status
      });

      return await response.json();
    } catch (error) {
      telemetryClient.recordError({ context: 'Deskera_MapDimensions' }, error);
      console.error('Error mapping custom dimensions in Deskera:', error);
      throw error;
    }
  }
}
