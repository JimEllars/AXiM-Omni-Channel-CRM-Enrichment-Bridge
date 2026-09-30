export const getBaseUrl = () => {
  // Use generic global object checks instead of just import.meta which can throw in CJS contexts depending on setup. But this is vite so import.meta should be fine.
  try {
      return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
  } catch (e) {
      return 'http://localhost:8787';
  }
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const apiFetch = async (path, options = {}, retries = 3, backoff = 500) => {
  const baseUrl = getBaseUrl();
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  let authKey = '';
  try {
      authKey = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('AXIM_AUTH_KEY') : '';
      if (!authKey) {
          authKey = import.meta.env.VITE_AXIM_INTERNAL_KEY || '';
      }
  } catch (e) { /* ignore */ }

  const traceId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

  const headers = {
    'Content-Type': 'application/json',
    'X-AXiM-Internal-Auth': authKey,
    'X-Bridge-Trace-Id': traceId,
    'X-Bridge-Timestamp': new Date().toISOString(),
    ...options?.headers
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers });

      if (response && response.ok) return response;

      // Immediately fail on 400, 401, 403, 422
      if (response && [400, 401, 403, 422].includes(response.status)) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Retry on 429, 502, 503, 504. Or if it's the last attempt, throw
      if (attempt === retries || (response && response.status < 500 && response.status !== 429)) {
        throw new Error(`HTTP ${response ? response.status : 'Unknown'}: ${response ? response.statusText : 'Unknown'}`);
      }
    } catch (err) {
      if (attempt === retries || (err.message && (err.message.startsWith('HTTP 400') || err.message.startsWith('HTTP 401') || err.message.startsWith('HTTP 403') || err.message.startsWith('HTTP 422')))) {
          throw err;
      }
    }
    const currentDelay = backoff * Math.pow(2, attempt) + Math.random() * 200;
    await delay(currentDelay);
  }
};
