import { google } from 'googleapis';
import { todayJst, randomId } from './utils.js';

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

// ソース一覧を読み込む（ヘッダ行をキーにしたオブジェクト配列）
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

// 案件DB への追加（URL重複はスキップ）
// 戻り値: { adoptedRecords: [{ id, url }, ...] }
export async function appendRecords(records, src) {
  if (!records || records.length === 0) {
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
