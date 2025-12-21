// src/sheets.js
// Google Sheets との読み書きユーティリティ

import { google } from 'googleapis';

const SHEET_ID = process.env.SHEET_ID;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SHEET_ID) {
  throw new Error('環境変数 SHEET_ID が設定されていません');
}
if (!SA_JSON) {
  throw new Error('環境変数 GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
}

const key = JSON.parse(SA_JSON);
const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

const auth = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  scopes,
);

const sheets = google.sheets({ version: 'v4', auth });

/**
 * 任意の範囲を読み込む
 * @param {string} range A1 書式 (例: 'ソース!A1:Z1000')
 * @returns {Promise<string[][]>}
 */
export async function readRange(range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });
  return res.data.values || [];
}

/**
 * 末尾に行を追加する
 * @param {string} range A1 書式 (例: '案件DB!A2:K')
 * @param {string[][]} rows
 */
export async function appendRows(range, rows) {
  if (!rows || rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}
