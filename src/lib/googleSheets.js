const SHEET_ID = import.meta.env.VITE_SPREADSHEET_ID;
const TOKEN_URL = import.meta.env.VITE_GRETA_TOKEN_URL;
const CHAT_ID = import.meta.env.VITE_CHAT_ID;

let cached = { token: null, exp: 0 };

export async function getAccessToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: CHAT_ID }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'token failed');
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 };
  return cached.token;
}

export async function sheetsRequest(path, init = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
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

export const getRows = (range) => sheetsRequest(`/values/${encodeURIComponent(range)}`).then(r => r.values || []);

export const appendRow = (range, values) => sheetsRequest(`/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
  method: 'POST',
  body: JSON.stringify({ values: [values] })
});

export const updateRow = (range, values) => sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
  method: 'PUT',
  body: JSON.stringify({ values: [values] })
});

let _meta = null;
export async function getSheetMeta(force = false) {
  if (!force && _meta) return _meta;
  const data = await sheetsRequest('/?fields=sheets.properties');
  _meta = Object.fromEntries((data.sheets || []).map(s => [s.properties.title, s.properties.sheetId]));
  return _meta;
}

export async function getSheetIdByTitle(title) {
  let m = await getSheetMeta();
  if (m[title] !== undefined) return m[title];
  m = await getSheetMeta(true);
  return m[title];
}

const colLetter = (n) => {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export async function ensureTab(title, headers) {
  let m = await getSheetMeta();
  if (m[title] === undefined) {
    await sheetsRequest('/:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] })
    });
    _meta = null;
  }
  const head = await getRows(`${title}!A1:${colLetter(headers.length)}1`);
  if (!head.length || !head[0] || head[0].length === 0) {
    await updateRow(`${title}!A1:${colLetter(headers.length)}1`, headers);
  }
}

export async function findRowIndexById(title, id) {
  const col = await getRows(`${title}!A:A`);
  for (let i = 1; i < col.length; i++) {
    if (col[i] && col[i][0] === id) return i + 1;
  }
  return -1;
}

export async function deleteRow(title, id) {
  const sheetId = await getSheetIdByTitle(title);
  if (sheetId === undefined) throw new Error(`tab not found: ${title}`);
  const sheetRow = await findRowIndexById(title, id);
  if (sheetRow < 0) throw new Error(`id not found in ${title}: ${id}`);
  const startIndex = sheetRow - 1;
  return sheetsRequest('/:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex, endIndex: startIndex + 1 } } }] }),
  });
}