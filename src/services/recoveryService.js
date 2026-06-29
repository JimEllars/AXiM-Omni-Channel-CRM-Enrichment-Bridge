import { ensureTab, getRows, appendRow, deleteRow, updateRow, findRowIndexById } from '../lib/googleSheets';

const TAB = 'Recovery';
const HEADERS = ['id', 'source', 'reason', 'payload', 'time', 'created_at'];

export const recoveryService = {
  async getAll() {
    await ensureTab(TAB, HEADERS);
    const rows = await getRows(`${TAB}!A2:F`);
    return rows.map(row => ({
      id: row[0],
      source: row[1],
      reason: row[2],
      payload: row[3],
      time: row[4],
      created_at: row[5]
    }));
  },

  async update(id, payload) {
    const rowIndex = await findRowIndexById(TAB, id);
    if (rowIndex === -1) throw new Error("Not found");
    const rows = await getRows(`${TAB}!A${rowIndex}:F${rowIndex}`);
    const original = rows[0];
    const updated = [original[0], original[1], original[2], payload, original[4], original[5]];
    await updateRow(`${TAB}!A${rowIndex}:F${rowIndex}`, updated);
  },

  async resolve(id) {
    return this.remove(id);
  },

  async remove(id) {
    return deleteRow(TAB, id);
  }
};