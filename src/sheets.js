import { google } from 'googleapis';

export async function getSheets(){
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.readonly']
  );
  await jwt.authorize();
  const sheets = google.sheets({version:'v4', auth: jwt});
  return { sheets, jwt };
}

export async function readAll(sheetName){
  const { sheets } = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${sheetName}`
  });
  const rows = res.data.values || [];
  if (rows.length<=1) return [];
  const head = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(head.map((h,i)=>[h, r[i] ?? ''])));
}

export async function appendRows(sheetName, rows){
  if (!rows.length) return;
  const { sheets } = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: sheetName,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
}

export async function readRange(sheetName){
  const { sheets } = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${sheetName}`
  });
  const vals = res.data.values || [];
  return vals;
}

export async function writeRange(sheetName, values){
  const { sheets } = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range: sheetName,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

export async function appendLog(level, msg){
  const { sheets } = await getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: 'ログ',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[now, level, String(msg)]] }
  }).catch(()=>{});
}
