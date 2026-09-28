import { telemetryClient, logToRecovery, telemetry } from '../../utils/telemetry.js';
import { logService } from '../logService.js';
import { resolveConflict } from '../../utils/conflictResolver.js';
import { normalizeToCanonical } from '../../models/canonicalSchema.js';

const hashString = async (str) => {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export class SuiteDashAdapter {
  constructor(publicId, secretKey, env) {
    this.publicId = publicId;
    this.secretKey = secretKey;
    this.env = env;
    this.baseUrl = 'https://app.suitedash.com/api/v1';
    this.metaCache = null;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // max 60 requests/minute
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

  async _request(method, endpoint, body = null, idempotencyKey = null, attempt = 0) {
    await this._enforceRateLimit();

    const headers = {
      'X-Public-ID': this.publicId,
      'X-Secret-Key': this.secretKey,
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

      telemetryClient.recordSpan('crm_fetch', Date.now() - start, {
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

      if (!response.ok && response.status !== 404) {
         throw new Error(`SuiteDash API Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (attempt < 5) {
          let delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
          delay = Math.min(delay, 60000);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this._request(method, endpoint, body, idempotencyKey, attempt + 1);
      }
      telemetryClient.recordError({ context: `SuiteDash_${method}`, endpoint }, error);
      logService.error('SuiteDash sync failure', { error: error.message, endpoint });
      throw error;
    }
  }

  async fetchMetaSchema() {
    if (this.metaCache) {
      return this.metaCache;
    }

    const start = Date.now();
    try {
      const [contactRes, companyRes] = await Promise.all([
        this._request('GET', '/contact/meta'),
        this._request('GET', '/company/meta')
      ]);

      const contactMeta = contactRes.ok ? await contactRes.json() : null;
      const companyMeta = companyRes.ok ? await companyRes.json() : null;

      telemetryClient.recordSpan('SuiteDash_FetchMeta', Date.now() - start, {
        contact_ok: contactRes.ok,
        company_ok: companyRes.ok
      });

      this.metaCache = { contact: contactMeta, company: companyMeta };
      return this.metaCache;
    } catch (error) {
      telemetryClient.recordError({ context: 'SuiteDash_FetchMeta' }, error);
      console.error('Failed to fetch SuiteDash meta schema:', error);
      throw error;
    }
  }

  toCanonical(externalPayload) {
      return normalizeToCanonical(externalPayload, 'SUITEDASH');
  }

  fromCanonical(canonicalRecord) {
      return {
          ...canonicalRecord,
          cf_sync_source: 'AXIM_BRIDGE'
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
    const externalId = canonicalContact.external_id || canonicalContact.primary_email;
    const idempotencyKey = await hashString(`${externalId}-${updateTimestamp}`);
    const recordHash = await hashString(JSON.stringify(canonicalContact));
    const fingerprintKey = `fingerprint:suitedash:${recordHash}`;

    // Record fingerprint in KV to suppress echo loops
    if (this.env && this.env.LEAD_KV) {
        await this.env.LEAD_KV.put(fingerprintKey, 'true', { expirationTtl: 300 }); // 5 minutes
    }

    const payload = this.fromCanonical(canonicalContact);

    const start = Date.now();
    try {
      telemetryClient.recordMetric('crm.suitedash.fetch.start', 1);
      const span = telemetryClient.startSpan('crm_fetch', { adapter: 'suitedash' });
      if (externalId) {
        const putRes = await this._request('PUT', `/contact/${encodeURIComponent(externalId)}`, payload, idempotencyKey);
        const duration = Date.now() - start;
        telemetryClient.recordMetric('crm.suitedash.fetch.duration_ms', duration);
        telemetryClient.recordMetric('crm.suitedash.records_received', 1);

        if (putRes.ok) {
          telemetryClient.recordMetric('suitedash.sync_contact.update.success', 1, { externalId });
          telemetryClient.recordSpan('SuiteDash_SyncContact_Update', duration, { status: putRes.status });
          span.end({ status: putRes.status, record_count: 1 });
          return await putRes.json();
        } else if (putRes.status === 404) {
          const postRes = await this._request('POST', '/contact', payload, idempotencyKey);
          if (postRes.ok) {
             telemetryClient.recordMetric('suitedash.sync_contact.create.success', 1, { fallback: true });
             telemetryClient.recordSpan('SuiteDash_SyncContact_CreateFallback', duration, { status: postRes.status });
             span.end({ status: postRes.status, record_count: 1 });
             return await postRes.json();
          }
          throw new Error(`Failed to create contact after 404 fallback: ${postRes.status}`);
        } else {
           throw new Error(`Failed to update contact: ${putRes.status}`);
        }
      } else {
        const postRes = await this._request('POST', '/contact', payload, idempotencyKey);
        const duration = Date.now() - start;
        telemetryClient.recordMetric('crm.suitedash.fetch.duration_ms', duration);
        telemetryClient.recordMetric('crm.suitedash.records_received', 1);

        if (postRes.ok) {
           telemetryClient.recordMetric('suitedash.sync_contact.create.success', 1, { externalId: 'none' });
           telemetryClient.recordSpan('SuiteDash_SyncContact_Create', duration, { status: postRes.status });
           span.end({ status: postRes.status, record_count: 1 });
           return await postRes.json();
        }
        throw new Error(`Failed to create contact: ${postRes.status}`);
      }
    } catch (error) {
      telemetryClient.recordMetric('suitedash.sync_contact.error', 1, {
         externalId: externalId || 'unknown'
      });
      telemetryClient.recordMetric('crm.suitedash.fetch.error', 1);
      telemetryClient.recordError({ context: 'SuiteDash_SyncContact' }, error);

      console.error('Error syncing contact to SuiteDash:', error);

      logService.error('SuiteDash sync failure', { error: error.message, adapter: 'suitedash' });

      logToRecovery(this.env, 'SuiteDashAdapter', error.message, canonicalContact);

      throw error;
    }
  }

  async checkInboundEcho(webhookPayload) {
      const canonical = this.toCanonical(webhookPayload);
      const recordHash = await hashString(JSON.stringify(canonical));
      const fingerprintKey = `fingerprint:suitedash:${recordHash}`;

      if (this.env && this.env.LEAD_KV) {
          const exists = await this.env.LEAD_KV.get(fingerprintKey);
          if (exists) {
              return true; // Echo detected
          }
      }
      return false; // Not an echo
  }
}
