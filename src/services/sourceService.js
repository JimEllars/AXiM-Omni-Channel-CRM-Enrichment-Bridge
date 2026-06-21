import { ensureTab, getRows, appendRow, deleteRow, updateRow, findRowIndexById } from '../lib/googleSheets';

const TAB = 'Sources';
const HEADERS = ['id', 'name', 'type', 'icon', 'status', 'count', 'created_at', 'updated_at'];

export const sourceService = {
  async getAll() {
    await ensureTab(TAB, HEADERS);
    const rows = await getRows(`${TAB}!A2:H`);
    return rows.map(row => ({
      id: row[0],
      name: row[1],
      type: row[2],
      icon: row[3],
      status: row[4],
      count: parseInt(row[5] || 0),
      created_at: row[6],
      updated_at: row[7]
    }));
  },

  async add(source) {
    await ensureTab(TAB, HEADERS);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newRow = [id, source.name, source.type, source.icon, 'Active', 0, now, now];
    await appendRow(`${TAB}!A:H`, newRow);
    return { id, ...source, status: 'Active', count: 0, created_at: now, updated_at: now };
  },

  async delete(id) {
    return deleteRow(TAB, id);
  }
};