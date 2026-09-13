export const getBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const apiFetch = async (path, options = {}) => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  // Ensure we send internal auth header if not explicitly overridden
  const authKey = sessionStorage.getItem('AXIM_AUTH_KEY') || import.meta.env.VITE_AXIM_INTERNAL_KEY || '';

  const headers = {
    'Content-Type': 'application/json',
    'X-AXiM-Internal-Auth': authKey,
    ...options.headers
  };

  let attempt = 0;
  const maxAttempts = 3;
  let backoffMs = 300;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(url, { ...options, headers });

      // Don't retry on client errors
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      if (!response.ok && attempt < maxAttempts - 1) {
         throw new Error(`HTTP Error: ${response.status}`);
      }

      return response;
    } catch (error) {
      attempt++;
      if (attempt >= maxAttempts) {
        // We will pipe network errors to telemetry in the error boundary or here if needed
        throw error;
      }
      // Exponential backoff with jitter
      const jitter = Math.random() * 100;
      await delay(backoffMs + jitter);
      backoffMs *= 2;
    }
  }
};
