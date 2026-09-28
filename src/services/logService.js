import { ensureTab, getRows, appendRow } from '../lib/googleSheets';

const TAB = 'Logs';
const HEADERS = ['id', 'type', 'severity', 'msg', 'time', 'created_at'];

export const logService = {
  async getRecentLogs() {
    await ensureTab(TAB, HEADERS);
    const rows = await getRows(`${TAB}!A2:F`);
    const logs = rows.map(row => ({
      id: row[0],
      type: row[1],
      severity: row[2],
      msg: row[3],
      time: row[4],
      created_at: row[5]
    })).reverse();
    return logs.slice(0, 10);
  },

  error(msg, context) {
    console.error(`[LogService Error] ${msg}`, context);
    this.add({ type: 'error', severity: 'HIGH', msg: `${msg} - ${JSON.stringify(context)}`, time: Date.now() }).catch(() => {});
  },

  logException(error, errorInfo) {
    console.error("[LogService Exception]", error, errorInfo);
    this.add({ type: 'exception', severity: 'CRITICAL', msg: `${error?.message || 'Unknown error'} - ${JSON.stringify(errorInfo)}`, time: Date.now() }).catch(() => {});
  },

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
    let id;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
    } else {
        id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    const now = new Date().toISOString();
    const newRow = [id, log.type, log.severity, log.msg, log.time, now];
    await appendRow(`${TAB}!A:F`, newRow);
  }
};
