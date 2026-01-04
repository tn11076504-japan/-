// src/details.js
//
// 役割:
//   1) 案件DB の URL(K列) から本文(Q列)を埋める (backfillBodiesFromSheet)
//   2) 本文(Q列)から補助率・上限額・対象を抽出して
//      案件DB の該当列(補助率/上限額/対象)を更新する (backfillMetaFromBody)

import fetch from 'node-fetch';
import { stripTags } from './utils.js';
import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

// 1回の本文バックフィル件数上限
const BODY_BACKFILL_LIMIT = 1000;

// 1回のメタ情報バックフィル件数上限
const META_BACKFILL_LIMIT = 500;

/**
 * URLからHTMLを取得し、タグを剥いだプレーンテキストを返す
 */
export async function fetchBodyText(url) {
  if (!url) return '';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const rawText = stripTags(html) || '';
  const normalized = rawText.replace(/\s+/g, ' ').trim();

  const MAX_LEN = 40000; // シート1セルの安全上限
  if (normalized.length > MAX_LEN) {
    return normalized.slice(0, MAX_LEN);
  }
  return normalized;
}

/**
 * 案件DBシートのうち、Q列「本文」が空 or '空欄' の行に対して、
 * URL(K列)をたどって本文を埋める。
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
  const urlColIndex = headers.indexOf('URL');
  const bodyColIndex = headers.indexOf('本文');

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
    if (body && body !== '空欄') continue;

    targets.push({
      rowIndex: i + 1, // 1始まり
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
 * 本文テキストから
 *   - 補助率 (rate)
 *   - 上限額 (limit)
 *   - 対象 (target)
 * をざっくり抽出する簡易パーサ
 */
function parseMetaFromBody(bodyText) {
  if (!bodyText) return { rate: '', limit: '', target: '' };

  const text = bodyText.replace(/\s+/g, ' ');

  // 上限額: 「上限」「上限額」「補助上限」＋ 金額表現(○○万円 / ○○円)
  let limit = '';
  const limitMatch = text.match(
    /(上限額?|補助上限)[^0-9０-９]{0,15}([0-9０-９,]+ ?万円|[0-9０-９,]+ ?円)/
  );
  if (limitMatch) {
    limit = limitMatch[2].replace(/\s+/g, '');
  }

  // 補助率: 「補助率」から句点/改行まで
  let rate = '';
  const rateSentenceMatch = text.match(/補助率[^。．\n]*[。．\n]/);
  if (rateSentenceMatch) {
    const s = rateSentenceMatch[0];
    // 「補助率：」以降を残す
    rate = s.replace(/^.*?補助率[:：]?\s*/, '').replace(/[。．\n]+$/, '');
  } else {
    // 予備: 「3分の2以内」「1/2以内」などの定番パターンだけ拾う
    const rateAlt = text.match(
      /(１\/２|1\/2|２\/３|2\/3|３\/４|3\/4|[１２３４]分の[１２３４])[^。．\n]{0,5}以内?/
    );
    if (rateAlt) {
      rate = rateAlt[0];
    }
  }

  // 対象: 「対象者」「対象事業」「対象となる」などを含む最初の1文
  let target = '';
  const targetMatch = text.match(/[^。．\n]*対象[^。．\n]*/);
  if (targetMatch) {
    target = targetMatch[0].trim();
  }

  return { rate, limit, target };
}

/**
 * 本文(Q列)から補助率・上限額・対象を抽出し、
 * 案件DB の「補助率」「上限額」「対象」列を一括更新する。
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
      'meta: 案件DBに 本文/補助率/上限額/対象 のいずれかの列がありません'
    );
    return;
  }

  const dataRowCount = rows.length - 1;
  const metaValues = new Array(dataRowCount)
    .fill(null)
    .map(() => ['', '', '']); // [補助率, 上限額, 対象]

  let updated = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const body = row[bodyColIndex] || '';
    if (!body) continue;

    // 既存値
    const currentRate = row[rateColIndex] || '';
    const currentLimit = row[limitColIndex] || '';
    const currentTarget = row[targetColIndex] || '';

    metaValues[i - 1][0] = currentRate;
    metaValues[i - 1][1] = currentLimit;
    metaValues[i - 1][2] = currentTarget;

    // 既に3つとも埋まっている行はスキップ
    if (currentRate && currentLimit && currentTarget) continue;

    if (updated >= META_BACKFILL_LIMIT) continue;

    const { rate, limit, target } = parseMetaFromBody(body);

    let changed = false;

    if (!currentRate && rate) {
      metaValues[i - 1][0] = rate;
      changed = true;
    }
    if (!currentLimit && limit) {
      metaValues[i - 1][1] = limit;
      changed = true;
    }
    if (!currentTarget && target) {
      metaValues[i - 1][2] = target;
      changed = true;
    }

    if (changed) {
      updated++;
    }
  }

  await logInfo(
    `meta: メタ情報バックフィル開始 updates=${updated}`
  );

  if (updated === 0) {
    return;
  }

  // 補助率〜対象列は連続している前提（例: H=補助率, I=上限額, J=対象）
  const startColLetter = columnNumberToLetter(rateColIndex + 1);
  const endColLetter = columnNumberToLetter(targetColIndex + 1);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `案件DB!${startColLetter}2:${endColLetter}${rows.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: metaValues,
    },
  });

  await logInfo(
    `meta: メタ情報バックフィル完了 updated=${updated}`
  );
}

/**
 * 列番号(1=A, 2=B, ...) を列記号に変換
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
