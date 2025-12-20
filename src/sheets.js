// src/sheets.js
import { google } from 'googleapis';
import { todayJst } from './utils.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  }
  const key = JSON.parse(json);
  return new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    SCOPES
  );
}

export function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// 「ソース」シート読み込み
export async function loadSources(spreadsheetId) {
  const sheets = getSheetsClient();
  const range = 'ソース!A1:Z1000';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const values = res.data.values || [];
  if (values.length === 0) return [];

  const header = values[0];
  const rows = values.slice(1);

  const idx = (name) => header.indexOf(name);

  const sources = rows
    .filter((row) => row.length > 0)
    .map((row) => ({
      有効: row[idx('有効')] || '',
      タイプ: row[idx('タイプ')] || '',
      県: row[idx('県')] || '',
      名称: row[idx('名称')] || '',
      URL: row[idx('URL')] || '',
      '主体(固定)': row[idx('主体(固定)')] || '',
      '締切抽出REGEX': row[idx('締切抽出REGEX')] || '',
      抽出IN: row[idx('抽出IN')] || '',
      抽出OUT: row[idx('抽出OUT')] || '',
      '範囲(パス)': row[idx('範囲(パス)')] || ''
    }))
    .filter((s) => String(s['有効']).toUpperCase() === 'TRUE');

  return sources;
}

// 「設定」シート読み込み（フィルタ条件など）
export async function loadSettings(spreadsheetId) {
  const sheets = getSheetsClient();
  const range = '設定!A1:B50';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const values = res.data.values || [];
  const map = {};
  for (const [k, v] of values) {
    if (!k) continue;
    map[k] = v;
  }

  return {
    FILTER_INCLUDE: map['抽出INデフォルト'] || '',
    FILTER_EXCLUDE: map['抽出OUTデフォルト'] || '',
    DEADLINE_MODE: map['締切抽出モード'] || 'LOOSE'
  };
}

// 案件DB に追記（重複判定は簡易）
export async function appendToDb(spreadsheetId, records) {
  if (!records || records.length === 0) return;

  const sheets = getSheetsClient();
  const range = '案件DB!A1:Q1';

  const values = records.map((r) => {
    const id = randomId();
    const dupKey = `${r.県 || ''} ${r.タイトル || ''}`.trim();
    return [
      id,                         // id
      r.取得日 || todayJst(),     // 取得日
      r.県 || '',                 // 県
      r.タイトル || '',           // タイトル
      r.公募主体 || '',           // 公募主体
      r.募集開始 || '',           // 募集開始
      r.締切日 || '',             // 締切日
      r.補助率 || '',             // 補助率
      r.上限額 || '',             // 上限額
      r.対象 || '',               // 対象
      r.URL || '',                // URL
      dupKey,                     // 重複キー（簡易）
      '新規',                     // 新規/更新
      0,                          // スコア
      r.出典 || '',               // 出典
      ''                          // 備考
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// 「ログ」シートに 1 行追加（A:時刻, B:レベル, C:メッセージ）
export async function appendLog(spreadsheetId, level, message) {
  const sheets = getSheetsClient();

  const now = new Date();
  const offsetMinutes = 9 * 60; // JST
  const jst = new Date(
    now.getTime() + (offsetMinutes - now.getTimezoneOffset()) * 60000
  );
  const ts = jst.toISOString().replace('T', ' ').slice(0, 19); // yyyy-MM-dd HH:mm:ss

  const values = [[ts, String(level), String(message)]];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'ログ!A:C',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });
  } catch (e) {
    // ログ書き込みに失敗しても、Actions 自体は止めない
    console.error('appendLog error:', e.message);
  }
}
