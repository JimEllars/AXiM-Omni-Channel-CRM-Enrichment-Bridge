import { ensureTab, getRows, updateRow, findRowIndexById, appendRow } from '../lib/googleSheets.js';
import { storage } from '../utils/storage.js';
import { apiFetch } from '../utils/api.js';

const TAB = 'Config';
const HEADERS = ['id', 'value', 'updated_at'];
const memCache = new Map();

export const configService = {
  async get(key, defaultValue) {
    // 1. In-memory cache
    if (memCache.has(key)) {
      return memCache.get(key);
    }

    // 2. Local storage cache
    const localVal = storage.get(`config_${key}`, null);
    if (localVal !== null) {
      memCache.set(key, localVal);
      return localVal;
    }

    // 3. Fallback to Google Sheets (or could be KV read if available)
    try {
        await ensureTab(TAB, HEADERS);
        const rowIndex = await findRowIndexById(TAB, key);
        if (rowIndex === -1) {
            memCache.set(key, defaultValue);
            return defaultValue;
        }
        const rows = await getRows(`${TAB}!B${rowIndex}:B${rowIndex}`);

        let parsedVal;
        try {
          parsedVal = JSON.parse(rows[0][0]);
        } catch {
          parsedVal = rows[0][0];
        }

        memCache.set(key, parsedVal);
        storage.set(`config_${key}`, parsedVal);
        return parsedVal;
    } catch (error) {
        console.warn('Failed to read config from Sheets, using default', error);
        return defaultValue;
    }
  },

  async set(key, value) {
    // Optimistic update
    memCache.set(key, value);
    storage.set(`config_${key}`, value);

    // Async sync to Sheets
    this._syncToSheets(key, value).catch(err => console.warn('Failed to sync config to Sheets:', err));

    // Async sync to KV worker endpoint
    this._syncToKV(key, value).catch(err => console.warn('Failed to sync config to KV:', err));
  },

  async _syncToSheets(key, value) {
    await ensureTab(TAB, HEADERS);
    const rowIndex = await findRowIndexById(TAB, key);
    const stringValue = JSON.stringify(value);
    const now = new Date().toISOString();
    
    if (rowIndex === -1) {
      await appendRow(`${TAB}!A:C`, [key, stringValue, now]);
    } else {
      await updateRow(`${TAB}!A${rowIndex}:C${rowIndex}`, [key, stringValue, now]);
    }
  },

  async _syncToKV(key, value) {
    try {
      // Assuming a management endpoint for KV sync
      await apiFetch('/v1/management/sync', {
        method: 'POST',
        body: JSON.stringify({ key, value })
      });
    } catch (error) {
      // Fail gracefully
      console.warn('KV Sync failed quietly:', error);
    }
  }
};
