export const getBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
};

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

  try {
    const response = await fetch(url, { ...options, headers });
    return response;
  } catch (error) {
    // We will pipe network errors to telemetry in the error boundary or here if needed
    throw error;
  }
};
