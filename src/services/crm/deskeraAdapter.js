import { telemetryClient, logToRecovery } from '../../utils/telemetry.js';
import { resolveConflict } from '../../utils/conflictResolver.js';
import { normalizeToCanonical } from '../../models/canonicalSchema.js';

// Simple hash function for idempotency key
const hashString = async (str) => {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export class DeskeraAdapter {
  constructor(credentials, env) {
    this.credentials = credentials;
    this.env = env;
    this.baseUrl = 'https://api.deskera.com';
    this.token = null;
    this.tokenExpiresAt = 0;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000 / (100 / 60); // 100 requests / minute
  }

  async _enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
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

  async _request(method, endpoint, body = null, idempotencyKey = null, attempt = 0) {
    await this._enforceRateLimit();
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

      if (response.status === 429 || response.status === 503) {
          if (attempt < 5) {
              const retryAfter = response.headers.get('Retry-After');
              let delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, attempt) + Math.random() * 1000;
              delay = Math.min(delay, 60000);
              await new Promise(resolve => setTimeout(resolve, delay));
              return this._request(method, endpoint, body, idempotencyKey, attempt + 1);
          } else {
              throw new Error(`Rate limit exceeded after max retries: ${response.status}`);
          }
      }

      if (!response.ok) {
         throw new Error(`Deskera API Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
        if (attempt < 5) {
            let delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
            delay = Math.min(delay, 60000);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this._request(method, endpoint, body, idempotencyKey, attempt + 1);
        }
      telemetryClient.recordError({ context: `Deskera_${method}`, endpoint }, error);
      throw error;
    }
  }

  toCanonical(externalPayload) {
      return normalizeToCanonical(externalPayload, 'DESKERA');
  }

  fromCanonical(canonicalRecord) {
      return {
          ...canonicalRecord,
          sync_source: 'AXIM_BRIDGE'
      };
  }

  diff(existingRecord, newCanonical) {
      const patch = {};
      for (const key in newCanonical) {
          if (existingRecord[key] !== newCanonical[key]) {
              patch[key] = newCanonical[key];
          }
      }
      return patch;
  }

  async syncContact(canonicalContact) {
    const updateTimestamp = canonicalContact.updated_at || new Date().toISOString();
    const contactId = canonicalContact.id || canonicalContact.primary_email;
    const idempotencyKey = await hashString(`${contactId}-${updateTimestamp}`);
    const recordHash = await hashString(JSON.stringify(canonicalContact));
    const fingerprintKey = `fingerprint:deskera:${recordHash}`;

    if (this.env && this.env.LEAD_KV) {
        await this.env.LEAD_KV.put(fingerprintKey, 'true', { expirationTtl: 300 });
    }

    const payload = this.fromCanonical(canonicalContact);

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
      logToRecovery(this.env, 'DeskeraAdapter', error.message, canonicalContact);

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

  async checkInboundEcho(webhookPayload) {
      const canonical = this.toCanonical(webhookPayload);
      const recordHash = await hashString(JSON.stringify(canonical));
      const fingerprintKey = `fingerprint:deskera:${recordHash}`;

      if (this.env && this.env.LEAD_KV) {
          const exists = await this.env.LEAD_KV.get(fingerprintKey);
          if (exists) {
              return true;
          }
      }
      return false;
  }
}
