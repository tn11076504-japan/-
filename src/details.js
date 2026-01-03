// src/details.js
import fetch from 'node-fetch';
import { stripTags } from './utils.js';
import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';
import { extractSubsidyInfo } from './textExtract.js';

// 1回の本文バックフィル件数の上限
// （URL→本文テキスト(Q列)を埋める処理）
const BODY_BACKFILL_LIMIT = 1000;

// 1回のメタ情報バックフィル件数の上限
// （本文(Q列)→補助率/上限額/対象(H/I/J列)を埋める処理）
const META_BACKFILL_LIMIT = 300;

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
 * 本文(Q列)をもとに、補助率(H列) / 上限額(I列) / 対象(J列) を
 * できる範囲で自動補完するバックフィル処理。
 *
 * 1回の実行では META_BACKFILL_LIMIT 件まで処理する。
 */
export async function backfillMetaFromBody() {
  const range = '案件DB!A1:Q';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    await logInfo('detail: 案件DBにデータ行がありません(meta)');
    return;
  }

  const headers = rows[0];
  const bodyColIndex = headers.indexOf('本文');
  const rateColIndex = headers.indexOf('補助率');
  const limitColIndex = headers.indexOf('上限額');
  const targetColIndex = headers.indexOf('対象');

  if (
    bodyColIndex === -1 ||
    rateColIndex === -1 ||
    limitColIndex === -1 ||
    targetColIndex === -1
  ) {
    await logWarn(
      'detail: 案件DBシートに 本文/補助率/上限額/対象 のいずれかが見つかりません(meta)'
    );
    return;
  }

  const updates = [];
  const touchedRows = new Set();

  for (let i = 1; i < rows.length; i++) {
    if (touchedRows.size >= META_BACKFILL_LIMIT) break;

    const row = rows[i] || [];
    const body = row[bodyColIndex] || '';

    if (!body || body === '空欄') continue;

    const currentRate = row[rateColIndex] || '';
    const currentLimit = row[limitColIndex] || '';
    const currentTarget = row[targetColIndex] || '';

    // すでに全部埋まっているならスキップ
    if (currentRate && currentLimit && currentTarget) continue;

    const info = extractSubsidyInfo(body);

    const rowIndex = i + 1;
    let changed = false;

    if (!currentRate && info.rate) {
      updates.push({
        range: `案件DB!${columnNumberToLetter(rateColIndex + 1)}${rowIndex}`,
        values: [[info.rate]],
      });
      changed = true;
    }

    if (!currentLimit && info.limit) {
      updates.push({
        range: `案件DB!${columnNumberToLetter(limitColIndex + 1)}${rowIndex}`,
        values: [[info.limit]],
      });
      changed = true;
    }

    if (!currentTarget && info.target) {
      updates.push({
        range: `案件DB!${columnNumberToLetter(targetColIndex + 1)}${rowIndex}`,
        values: [[info.target]],
      });
      changed = true;
    }

    if (changed) {
      touchedRows.add(rowIndex);
    }
  }

  await logInfo(
    `detail: メタ情報バックフィル開始 rows=${touchedRows.size} updates=${updates.length}`
  );

  if (updates.length === 0) {
    await logInfo('detail: メタ情報バックフィル対象なし');
    return;
  }

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  await logInfo(
    `detail: メタ情報バックフィル完了 updatedRows=${touchedRows.size}`
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
