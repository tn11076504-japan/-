// src/details.js
import fetch from 'node-fetch';
import { stripTags, extractSubsidyRateFromText } from './utils.js';
import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

// 本文バックフィル：1 回の最大件数
const BODY_BACKFILL_LIMIT = 1000;

// メタ情報（補助率）バックフィル：1 回の最大更新件数
const META_BACKFILL_LIMIT = 200;

/**
 * 指定 URL から HTML を取得し、テキスト本文を抽出して返す。
 * 長すぎる場合は Google スプレッドシート 1 セルの上限を考慮してカットする。
 */
export async function fetchBodyText(url) {
  if (!url) return '';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const rawText = stripTags(html) || '';

  // 改行やタブをまとめて 1 行テキストに近い形に整える
  const normalized = rawText.replace(/\s+/g, ' ').trim();

  // Google スプレッドシート 1 セルは ~5 万文字程度なので、
  // 余裕を見て 4 万字でカット。
  const MAX_LEN = 40000;
  if (normalized.length > MAX_LEN) {
    return normalized.slice(0, MAX_LEN);
  }
  return normalized;
}

/**
 * 案件DB シートのうち、Q 列「本文」が空 or '空欄' になっている行を対象に、
 * K 列の URL から本文を取得して Q 列に書き込む。
 *
 * 1 回の実行では BODY_BACKFILL_LIMIT 件まで処理。
 */
export async function backfillBodiesFromSheet() {
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
  const urlColIndex = headers.indexOf('URL');   // K 列
  const bodyColIndex = headers.indexOf('本文'); // Q 列

  if (urlColIndex === -1 || bodyColIndex === -1) {
    await logWarn(
      'detail: 案件DBシートに URL 列 または 本文 列 が見つかりません'
    );
    return;
  }

  const targets = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const url = row[urlColIndex] || '';
    const body = row[bodyColIndex] || '';

    if (!url) continue;
    // すでに本文が入っている行はスキップ（'空欄' はバックフィル対象）
    if (body && body !== '空欄') continue;

    targets.push({
      rowIndex: i + 1, // シートの行番号（1始まり）
      url,
    });

    if (targets.length >= BODY_BACKFILL_LIMIT) break;
  }

  await logInfo(`detail: 本文バックフィル開始 count=${targets.length}`);

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
        range: `案件DB!${columnNumberToLetter(bodyColIndex + 1)}${t.rowIndex}`,
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

  await logInfo(`detail: 本文バックフィル完了 updated=${updatedCount}`);
}

/**
 * 本文（Q 列）を使って補助率（H 列）を自動で埋めるバックフィル。
 *
 * 対象:
 *   - Q 列「本文」が入っている
 *   - H 列「補助率」が空 or '空欄'
 *
 * 1 回の実行では META_BACKFILL_LIMIT 件まで更新。
 */
export async function backfillMetaFromBody() {
  const range = '案件DB!A1:Q';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    await logInfo('meta: 案件DBにデータ行がありません');
    return;
  }

  const headers = rows[0];
  const bodyColIndex = headers.indexOf('本文');   // Q 列
  const rateColIndex = headers.indexOf('補助率'); // H 列

  if (bodyColIndex === -1 || rateColIndex === -1) {
    await logWarn(
      'meta: 案件DBシートに 本文 列 または 補助率 列 が見つかりません'
    );
    return;
  }

  const updates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const body = row[bodyColIndex] || '';
    const currentRate = row[rateColIndex] || '';

    if (!body) continue;
    if (currentRate && currentRate !== '空欄') continue;

    const rate = extractSubsidyRateFromText(body);
    if (!rate) continue;

    updates.push({
      rowIndex: i + 1,
      rate,
    });

    if (updates.length >= META_BACKFILL_LIMIT) break;
  }

  await logInfo(`meta: メタ情報バックフィル開始 updates=${updates.length}`);

  if (updates.length === 0) {
    await logInfo('meta: メタ情報バックフィル対象なし');
    return;
  }

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates.map((u) => ({
        range: `案件DB!${columnNumberToLetter(rateColIndex + 1)}${u.rowIndex}`,
        values: [[u.rate]],
      })),
    },
  });

  await logInfo(`meta: メタ情報バックフィル完了 updated=${updates.length}`);
}

/**
 * 列番号 (1=A, 2=B, ...) を A1 表記の列名に変換する。
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
