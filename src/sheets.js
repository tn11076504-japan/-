// src/sheets.js
import { google } from 'googleapis';
import { todayJst } from './utils.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// サービスアカウントから認証クライアントを作成
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

// ソースシートを読む
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

// 設定シートを読む（フィルタ条件など）
export async function loadSettings(spreadsheetId) {
  const sheets = getSheetsClient();
  const range = '設定!A1:B20';

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

// 案件DB に追記（重複チェックはあとで強化）
export async function appendToDb(spreadsheetId, records) {
  if (!records || records.length === 0) return;

  const sheets = getSheetsClient();
  const range = '案件DB!A1:Q1';

  const values = records.map((r) => {
    const id = randomId();
    const dupKey = `${r.県} ${r.タイトル}`.trim();
    return [
      id,
      r.取得日 || todayJst(),
      r.県 || '',
      r.タイトル || '',
      r.公募主体 || '',
      r.募集開始 || '',
      r.締切日 || '',
      r.補助率 || '',
      r.上限額 || '',
      r.対象 || '',
      r.URL || '',
      dupKey,
      '新規',
      0,
      r.出典 || '',
      ''
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
