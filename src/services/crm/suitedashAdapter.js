// SuiteDash Adapter
export class SuiteDashAdapter {
  constructor(publicId, secretKey) {
    this.publicId = publicId;
    this.secretKey = secretKey;
    this.baseUrl = 'https://app.suitedash.com/api/v1'; // Assuming generic API endpoint
    this.metaCache = null;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000 / 0.40; // Leaky bucket: <= 0.40 requests/sec => 2500ms
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

  async _request(method, endpoint, body = null) {
    await this._enforceRateLimit();

    const headers = {
      'X-Public-ID': this.publicId,
      'X-Secret-Key': this.secretKey,
      'Content-Type': 'application/json',
    };

    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    // Check if it's a 404, we might want to handle it specifically for PUT requests
    if (!response.ok && response.status !== 404) {
       throw new Error(`SuiteDash API Error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async fetchMetaSchema() {
    if (this.metaCache) {
      return this.metaCache;
    }

    try {
      const [contactRes, companyRes] = await Promise.all([
        this._request('GET', '/contact/meta'),
        this._request('GET', '/company/meta')
      ]);

      const contactMeta = contactRes.ok ? await contactRes.json() : null;
      const companyMeta = companyRes.ok ? await companyRes.json() : null;

      this.metaCache = { contact: contactMeta, company: companyMeta };
      return this.metaCache;
    } catch (error) {
      console.error('Failed to fetch SuiteDash meta schema:', error);
      throw error;
    }
  }

  async syncContact(canonicalContact) {
    // Determine the external ID if available in the mapping (would normally be passed in or looked up)
    // For this simulation, we'll assume it's part of canonicalContact if it exists, or we use primary_email
    const externalId = canonicalContact.external_id || canonicalContact.primary_email;

    const payload = {
      ...canonicalContact,
      cf_sync_source: 'AXIM_BRIDGE' // Eliminate echo loops
    };

    try {
      if (externalId) {
        // Cache-first lookup / update
        const putRes = await this._request('PUT', `/contact/${encodeURIComponent(externalId)}`, payload);

        if (putRes.ok) {
          return await putRes.json();
        } else if (putRes.status === 404) {
          // Fallback to POST
          const postRes = await this._request('POST', '/contact', payload);
          if (postRes.ok) {
             return await postRes.json();
          }
          throw new Error(`Failed to create contact after 404 fallback: ${postRes.status}`);
        } else {
           throw new Error(`Failed to update contact: ${putRes.status}`);
        }
      } else {
        // No ID, just create
        const postRes = await this._request('POST', '/contact', payload);
        if (postRes.ok) {
           return await postRes.json();
        }
        throw new Error(`Failed to create contact: ${postRes.status}`);
      }
    } catch (error) {
      console.error('Error syncing contact to SuiteDash:', error);
      throw error;
    }
  }
}
