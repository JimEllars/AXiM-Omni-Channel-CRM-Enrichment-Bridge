/**
 * Simple Persistence Layer with Cloudflare KV / Pages Functions API tiering
 */
import { apiFetch } from './api.js';

export const storage = {
  get: (key, defaultValue) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultValue;
    }
    try {
      const data = localStorage.getItem(`axim_${key}`);
      if (!data) return defaultValue;

      const parsed = JSON.parse(data);
      if (parsed.updated_at) {
        const age = Date.now() - new Date(parsed.updated_at).getTime();
        if (age > 24 * 60 * 60 * 1000) { // 24 hour expiration
          localStorage.removeItem(`axim_${key}`);
          return defaultValue;
        }
      }
      return parsed.value !== undefined ? parsed.value : parsed;
    } catch (e) {
      console.warn('localStorage get failed', e);
      return defaultValue;
    }
  },

  set: (key, value) => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      const payload = {
        value,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(`axim_${key}`, JSON.stringify(payload));
    } catch (e) {
      console.warn('localStorage set failed', e);
    }
  },

  // Resilient Tiering Strategy
  getAsync: async (key, defaultValue) => {
    // 1. Primary: Try Cloudflare KV via API
    try {
      const res = await apiFetch(`/api/kv/${key}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.value !== undefined) {
          // Sync to secondary storage
          storage.set(key, data.value);
          return data.value;
        }
      }
    } catch (err) {
      console.warn('KV fetch failed, falling back to local', err);
    }

    // 2. Secondary: Fallback to localStorage
    return storage.get(key, defaultValue);
  },

  setAsync: async (key, value) => {
    // Optimistic local update
    storage.set(key, value);

    // Sync to primary KV
    try {
      await apiFetch(`/api/kv/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value })
      });
    } catch (err) {
      console.warn('KV set failed', err);
    }
  }
};
