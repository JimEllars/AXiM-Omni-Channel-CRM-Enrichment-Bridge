export class DeskeraAdapter {
  constructor(credentials) {
    this.credentials = credentials; // Should contain clientId, clientSecret, username, password, etc.
    this.baseUrl = 'https://api.deskera.com'; // Assuming generic API endpoint
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async _authenticate() {
    const now = Date.now();
    // Auto-refresh token 10 minutes prior to expiration (10 * 60 * 1000 = 600,000 ms)
    if (this.token && now < this.tokenExpiresAt - 600000) {
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/iam/auth/sign-in/web/sign-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.credentials)
      });

      if (!response.ok) {
        throw new Error(`Deskera Auth Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.token = data.access_token || data.token; // Adjust based on actual response
      // Assuming token is valid for 1 hour if not specified
      const expiresIn = data.expires_in ? data.expires_in * 1000 : 3600 * 1000;
      this.tokenExpiresAt = now + expiresIn;
    } catch (error) {
      console.error('Deskera authentication failed:', error);
      throw error;
    }
  }

  async _request(method, endpoint, body = null) {
    await this._authenticate();

    const headers = {
      'x-access-token': this.token,
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

    if (!response.ok) {
       throw new Error(`Deskera API Error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async syncContact(canonicalContact) {
    const payload = {
      ...canonicalContact,
      sync_source: 'AXIM_BRIDGE' // Identifier for loop prevention
    };

    try {
      // Assuming a generic POST endpoint for contacts
      const response = await this._request('POST', '/v1/contact', payload);
      return await response.json();
    } catch (error) {
      console.error('Error syncing contact to Deskera:', error);
      throw error;
    }
  }

  async mapCustomDimensions(dimensions) {
    try {
      const response = await this._request('POST', '/v1/dimension', dimensions);
      return await response.json();
    } catch (error) {
      console.error('Error mapping custom dimensions in Deskera:', error);
      throw error;
    }
  }
}
