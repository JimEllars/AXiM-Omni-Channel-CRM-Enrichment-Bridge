import { ensureTab, getRows, appendRow } from '../lib/googleSheets';

const TAB = 'Logs';
const HEADERS = ['id', 'type', 'severity', 'msg', 'time', 'created_at'];

export const logService = {
  async getAll() {
    await ensureTab(TAB, HEADERS);
    const rows = await getRows(`${TAB}!A2:F`);
    return rows.map(row => ({
      id: row[0],
      type: row[1],
      severity: row[2],
      msg: row[3],
      time: row[4],
      created_at: row[5]
    })).reverse(); // Newest first
  },

  async add(log) {
    await ensureTab(TAB, HEADERS);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newRow = [id, log.type, log.severity, log.msg, log.time, now];
    await appendRow(`${TAB}!A:F`, newRow);
  }
};