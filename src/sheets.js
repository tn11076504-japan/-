// src/sheets.js
//
// Google スプレッドシートとのやり取り
//

import { google } from 'googleapis';
import { nowJstTimestamp, todayJstDate } from './utils.js';

const SHEET_ID = process.env.SHEET_ID;
if (!SHEET_ID) {
  console.error('環境変数 SHEET_ID が設定されていません');
  process.exit(1);
}

const SERVICE_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_JSON) {
  console.error('環境変数 GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  process.exit(1);
}

const credentials = JSON.parse(SERVICE_JSON);

const auth = new google.auth.JWT(
  credentials.client_email,
  undefined,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

const SHEET_SOURCES = 'ソース';
const SHEET_RECORDS = '案件DB';
const SHEET_LOG = 'ログ';

/**
 * ソース一覧を読み込む
 * A:有効, B:タイプ, C:県, D:名称, E:URL, F:主体(固定),
 * G:締切抽出REGEX, H:詳細取得, I:最終ETag, J:最終Modified, K:最終取得,
 * L:抽出IN, M:抽出OUT, N:範囲(パス),
 * O:募集開始REGEX, P:補助率REGEX, Q:上限額REGEX, R:対象REGEX
 */
export async function readSources() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_SOURCES}!A2:R`
  });

  const values = res.data.values || [];
  const sources = values
    .map((row, idx) => {
      const [
        enabled,
        type,
        pref,
        name,
        url,
        fixedOrg,
        deadlineRegex,
        detailFlag,
        lastEtag,
        lastModified,
        lastFetched,
        includeIn,
        includeOut,
        scopePath,
        startRegex,
        rateRegex,
        limitRegex,
        targetRegex
      ] = row;

      return {
        rowIndex: idx + 2, // 行番号（ログ用）
        enabled: String(enabled || '').toUpperCase() === 'TRUE',
        type: (type || 'html').toLowerCase(),
        pref: pref || '',
        name: name || '',
        url: url || '',
        fixedOrg: fixedOrg || '',
        deadlineRegex: deadlineRegex || '',
        detail: String(detailFlag || '').toUpperCase() === 'TRUE',
        includeIn: includeIn || '',
        includeOut: includeOut || '',
        scopePath: scopePath || '',
        startRegex: startRegex || '',
        rateRegex: rateRegex || '',
        limitRegex: limitRegex || '',
        targetRegex: targetRegex || ''
      };
    })
    .filter(src => src.enabled && src.url);

  return sources;
}

/**
 * 案件DB にレコードを追加
 * 案件DB の列は以下想定:
 * A:id, B:取得日, C:県, D:タイトル, E:公募主体, F:募集開始,
 * G:締切日, H:補助率, I:上限額, J:対象, K:URL
 */
export async function appendRecords(records) {
  if (!records || records.length === 0) return;
  const values = records.map(rec => {
    const id = rec.id || makeId();
    const date = rec.取得日 || todayJstDate();
    return [
      id,
      date,
      rec.県 || '',
      rec.タイトル || '',
      rec.公募主体 || '',
      rec.募集開始 || '',
      rec.締切日 || '',
      rec.補助率 || '',
      rec.上限額 || '',
      rec.対象 || '',
      rec.URL || ''
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_RECORDS}!A2`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}

/**
 * ログ書き込み
 */
export async function logInfo(message) {
  await appendLog('INFO', message);
}

export async function logWarn(message) {
  await appendLog('WARN', message);
}

export async function logError(message) {
  await appendLog('ERROR', message);
}

async function appendLog(level, message) {
  const ts = nowJstTimestamp();
  console.log(`[${level}] ${message}`);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_LOG}!A2`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[ts, level, String(message)]]
    }
  });
}

// 簡易 ID 生成
function makeId() {
  return Math.random().toString(36).slice(2, 6);
}
