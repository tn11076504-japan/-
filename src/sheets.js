import { google } from 'googleapis';
import { getJstNow, formatJstDateTime } from './utils.js';

const SHEET_ID = process.env.SHEET_ID;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SHEET_ID) {
  throw new Error('環境変数 SHEET_ID が設定されていません');
}
if (!SA_JSON) {
  throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
}

const sa = JSON.parse(SA_JSON);
const auth = new google.auth.JWT(sa.client_email, null, sa.private_key, [
  'https://www.googleapis.com/auth/spreadsheets',
]);
const sheets = google.sheets({ version: 'v4', auth });

export { sheets as sheetsClient, SHEET_ID };

// ==============================
// ログ関連
// ==============================

function nowJstDateTimeString() {
  const now = new Date();
  const jstMillis = now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000;
  const jst = new Date(jstMillis);
  return jst.toISOString().replace('T', ' ').slice(0, 19);
}

async function appendLog(level, message) {
  const ts = nowJstDateTimeString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'ログ!A:C',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[ts, level, message]] },
  });
}

export async function logInfo(message) {
  return appendLog('INFO', message);
}

export async function logWarn(message) {
  return appendLog('WARN', message);
}

// ==============================
// ソース読み込み
// ==============================

export async function loadSources() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'ソース!A1:R',
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return [];
  const headers = rows[0];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx] ?? '';
    });
    out.push(obj);
  }
  return out;
}

// ==============================
// 案件DBへの追加
// ==============================

export async function appendRecords(records, src) {
  if (!records || records.length === 0) {
    await logInfo(
      `source=${src['名称']} type=${src['タイプ']} total=0 adopted=0`,
    );
    return { adoptedRecords: [] };
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '案件DB!A1:K',
  });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const urlIdx = headers.indexOf('URL');
  if (urlIdx === -1) {
    throw new Error('案件DB シートに URL 列がありません');
  }

  const existingUrls = new Set(
    rows.slice(1).map((r) => r[urlIdx]).filter(Boolean),
  );

  const adoptedRecords = [];
  const valuesToAppend = [];

  for (const rec of records) {
    const url = rec.URL;
    if (!url) continue;
    if (existingUrls.has(url)) continue;

    const id = randomId();
    adoptedRecords.push({ id, url });

    const rowValues = headers.map((h) => {
      switch (h) {
        case 'id':
          return id;
        case '取得日':
          return rec['取得日'] || todayJst();
        case '県':
          return rec['県'] || src['県'] || '';
        case 'タイトル':
          return rec['タイトル'] || '';
        case '公募主体':
          return rec['公募主体'] || src['主体(固定)'] || '';
        case '募集開始':
          return rec['募集開始'] || '';
        case '締切日':
          return rec['締切日'] || '';
        case '補助率':
          return rec['補助率'] || '';
        case '上限額':
          return rec['上限額'] || '';
        case '対象':
          return rec['対象'] || '';
        case 'URL':
          return rec['URL'] || '';
        default:
          return '';
      }
    });

    valuesToAppend.push(rowValues);
  }

  if (valuesToAppend.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: '案件DB!A1:K',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: valuesToAppend },
    });
  }

  await logInfo(
    `source=${src['名称']} type=${src['タイプ']} total=${records.length} adopted=${adoptedRecords.length}`,
  );

  return { adoptedRecords };
}

// ==============================
// Q列「本文」バックフィル用
// ==============================

// Q列を「本文」として扱う前提。
// URL があり、「本文」が空 or "空欄" の行を上から順に limit 件だけ返す。
export async function findRecordsNeedingBody(limit = 20) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '案件DB!A1:Q',
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return [];

  const headers = rows[0] || [];
  const urlIdx = headers.indexOf('URL');
  const bodyIdx = headers.indexOf('本文');
  if (urlIdx === -1 || bodyIdx === -1) {
    throw new Error('案件DB シートに URL または 本文 列がありません');
  }

  const targets = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const url = row[urlIdx];
    const body = row[bodyIdx];

    if (url && (!body || body === '空欄')) {
      targets.push({
        rowNumber: i + 1, // 1-based
        url,
      });
      if (targets.length >= limit) break;
    }
  }

  return targets;
}

// findRecordsNeedingBody で拾った行に対して、本文明を一括で書き込む
export async function writeBodies(targets) {
  if (!targets || targets.length === 0) return;

  const data = targets.map((t) => ({
    range: `案件DB!Q${t.rowNumber}`,
    values: [[t.body ?? '空欄']],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}
