// Cloudflare Worker specific utility for Google Sheets
// This operates without Vite environment variables, using the worker's `env`.

let cached = { token: null, exp: 0 };

export async function getWorkerAccessToken(env) {
  if (cached.token && Date.now() < cached.exp) return cached.token;

  const tokenUrl = env.GRETA_TOKEN_URL || "https://addons.questera.ai/api/sheets/access-token";
  const chatId = env.CHAT_ID || "chat-bc69b752-1ee5-44e1-b7a1-7cc09e44801c";

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: chatId }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'token failed');
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
  return cached.token;
}

export async function workerSheetsRequest(env, path, init = {}) {
  const token = await getWorkerAccessToken(env);
  const sheetId = env.SPREADSHEET_ID || "1Ape3xX5L-gLAiPX_Lqds05ZqmxZRYfXJ0XVA6kc7zAE";

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text}`);
  }
  return res.json();
}

export const workerAppendRow = (env, range, values) => workerSheetsRequest(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
  method: 'POST',
  body: JSON.stringify({ values: [values] })
});

export async function logToSheets(env, type, severity, msg) {
  try {
    const id = crypto.randomUUID();
    const time = new Date().toLocaleTimeString();
    const now = new Date().toISOString();
    const newRow = [id, type, severity, msg, time, now];
    await workerAppendRow(env, `Logs!A:F`, newRow);
  } catch (error) {
    console.error("Failed to log to sheets:", error);
  }
}

export async function logToRecovery(env, source, reason, payload) {
  console.log("Logging to recovery:", source, reason);
  try {
    const id = crypto.randomUUID();
    const time = new Date().toLocaleTimeString();
    const now = new Date().toISOString();
    const newRow = [id, source, reason, JSON.stringify(payload), time, now];
    await workerAppendRow(env, `Recovery!A:F`, newRow);
  } catch (error) {
    console.error("Failed to write to recovery sheet:", error);
  }
}
