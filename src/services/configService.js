import { ensureTab, getRows, updateRow, findRowIndexById, appendRow } from '../lib/googleSheets';

const TAB = 'Config';
const HEADERS = ['id', 'value', 'updated_at'];

export const configService = {
  async get(key, defaultValue) {
    await ensureTab(TAB, HEADERS);
    const rowIndex = await findRowIndexById(TAB, key);
    if (rowIndex === -1) return defaultValue;
    const rows = await getRows(`${TAB}!B${rowIndex}:B${rowIndex}`);
    try {
      return JSON.parse(rows[0][0]);
    } catch {
      return rows[0][0];
    }
  },

  async set(key, value) {
    await ensureTab(TAB, HEADERS);
    const rowIndex = await findRowIndexById(TAB, key);
    const stringValue = JSON.stringify(value);
    const now = new Date().toISOString();
    
    if (rowIndex === -1) {
      await appendRow(`${TAB}!A:C`, [key, stringValue, now]);
    } else {
      await updateRow(`${TAB}!A${rowIndex}:C${rowIndex}`, [key, stringValue, now]);
    }
  }
};