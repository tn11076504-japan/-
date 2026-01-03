// src/details.js
import fetch from 'node-fetch';
import { stripTags } from './utils.js';
import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

// 1回の本文バックフィル件数の上限
// 必要に応じて 50 や 200 に増やせば、一気に埋めることもできます。
const BODY_BACKFILL_LIMIT = 100;

/**
 * 指定URLからHTMLを取得し、テキスト本文だけを抽出して返す。
 * 長すぎる場合はGoogleスプレッドシート1セルの上限を考慮してカットする。
 */
export async function fetchBodyText(url) {
  if (!url) return '';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const rawText = stripTags(html) || '';

  // 改行やタブをまとめて、1行テキストに近い形に整える
  const normalized = rawText.replace(/\s+/g, ' ').trim();

  // Googleスプレッドシートの1セルは ~5万文字程度が上限なので、
  // 余裕をもって4万字でカット。
  const MAX_LEN = 40000;
  if (normalized.length > MAX_LEN) {
    return normalized.slice(0, MAX_LEN);
  }
  return normalized;
}

/**
 * 案件DBシートのうち、Q列「本文」が空 or '空欄' になっている行を対象に、
 * URL列（K列）のURLから本文を取得してQ列に書き込むバックフィル処理。
 *
 * 1回の実行では BODY_BACKFILL_LIMIT 件まで処理する。
 */
export async function backfillBodiesFromSheet() {
  // 案件DBの A〜Q 列を全部取得（1行目はヘッダ）
  const range = '案件DB!A1:Q';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    await logInfo('detail: 案件DBにデータ行がありません');
    return;
  }

  const headers = rows[0];
  const urlColIndex = headers.indexOf('URL');
  const bodyColIndex = headers.indexOf('本文');

  if (urlColIndex === -1 || bodyColIndex === -1) {
    await logWarn(
      'detail: 案件DBシートに URL 列 または 本文 列 が見つかりません'
    );
    return;
  }

  // Q列が空（または '空欄'）で、URLが入っている行だけを対象にする
  const targets = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const url = row[urlColIndex] || '';
    const body = row[bodyColIndex] || '';

    if (!url) continue;
    // すでに本文が入っている行はスキップ（'空欄' もバックフィル対象）
    if (body && body !== '空欄') continue;

    targets.push({
      rowIndex: i + 1, // シートの行番号（1始まり）
      url,
    });

    if (targets.length >= BODY_BACKFILL_LIMIT) break;
  }

  await logInfo(
    `detail: 本文バックフィル開始 count=${targets.length}`
  );

  if (targets.length === 0) {
    return;
  }

  let updatedCount = 0;

  for (const t of targets) {
    try {
      const text = await fetchBodyText(t.url);
      const value = text || '空欄';

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `案件DB!${columnNumberToLetter(
          bodyColIndex + 1
        )}${t.rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[value]],
        },
      });

      updatedCount++;
    } catch (err) {
      await logWarn(
        `detail: fetchBody error url=${t.url} msg=${err.message}`
      );
    }
  }

  await logInfo(
    `detail: 本文バックフィル完了 updated=${updatedCount}`
  );
}

/**
 * 列番号(1=A, 2=B, ...) を A1表記の列名に変換するユーティリティ。
 */
function columnNumberToLetter(colNum) {
  let temp = colNum;
  let letters = '';
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    temp = Math.floor((temp - 1) / 26);
  }
  return letters;
}
