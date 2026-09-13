import { telemetryClient, logToRecovery } from '../../utils/telemetry.js';

const hashString = async (str) => {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export class SuiteDashAdapter {
  constructor(publicId, secretKey) {
    this.publicId = publicId;
    this.secretKey = secretKey;
    this.baseUrl = 'https://app.suitedash.com/api/v1';
    this.metaCache = null;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000 / 0.40;
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

  async _request(method, endpoint, body = null, idempotencyKey = null) {
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

      telemetryClient.recordSpan(`SuiteDash_${method}`, Date.now() - start, {
        endpoint,
        status: response.status
      });

      if (!response.ok && response.status !== 404) {
         throw new Error(`SuiteDash API Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      telemetryClient.recordError({ context: `SuiteDash_${method}`, endpoint }, error);
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

  async syncContact(canonicalContact) {
    const updateTimestamp = canonicalContact.updated_at || new Date().toISOString();
    const externalId = canonicalContact.external_id || canonicalContact.primary_email;
    const idempotencyKey = await hashString(`${externalId}-${updateTimestamp}`);

    const payload = {
      ...canonicalContact,
      cf_sync_source: 'AXIM_BRIDGE'
    };

    const start = Date.now();
    try {
      if (externalId) {
        const putRes = await this._request('PUT', `/contact/${encodeURIComponent(externalId)}`, payload, idempotencyKey);

        if (putRes.ok) {
          telemetryClient.recordMetric('suitedash.sync_contact.update.success', 1, { externalId });
          telemetryClient.recordSpan('SuiteDash_SyncContact_Update', Date.now() - start, { status: putRes.status });
          return await putRes.json();
        } else if (putRes.status === 404) {
          const postRes = await this._request('POST', '/contact', payload, idempotencyKey);
          if (postRes.ok) {
             telemetryClient.recordMetric('suitedash.sync_contact.create.success', 1, { fallback: true });
             telemetryClient.recordSpan('SuiteDash_SyncContact_CreateFallback', Date.now() - start, { status: postRes.status });
             return await postRes.json();
          }
          throw new Error(`Failed to create contact after 404 fallback: ${postRes.status}`);
        } else {
           throw new Error(`Failed to update contact: ${putRes.status}`);
        }
      } else {
        const postRes = await this._request('POST', '/contact', payload, idempotencyKey);
        if (postRes.ok) {
           telemetryClient.recordMetric('suitedash.sync_contact.create.success', 1, { externalId: 'none' });
           telemetryClient.recordSpan('SuiteDash_SyncContact_Create', Date.now() - start, { status: postRes.status });
           return await postRes.json();
        }
        throw new Error(`Failed to create contact: ${postRes.status}`);
      }
    } catch (error) {
      telemetryClient.recordMetric('suitedash.sync_contact.error', 1, {
         externalId: externalId || 'unknown'
      });
      telemetryClient.recordError({ context: 'SuiteDash_SyncContact' }, error);
      console.error('Error syncing contact to SuiteDash:', error);

      logToRecovery({}, 'SuiteDashAdapter', error.message, canonicalContact);

      throw error;
    }
  }
}
