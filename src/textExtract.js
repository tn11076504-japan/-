// src/textExtract.js
// 「本文」から上限額・対象を抽出し、案件DB の I列(上限額) / J列(対象) をバックフィルする

import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

// 1回のメタ情報バックフィル件数
const META_BACKFILL_LIMIT = 50;

// ==============================
// 上限額 抽出ロジック
// ==============================

export function extractUpperLimitFromBody(body) {
  if (!body) return '';

  // 全角スペースなどを軽く正規化
  const text = body
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // 「上限」「上限額」「補助上限」付近を優先して探す
  const limitPatterns = [
    /上限額[:：]?\s*([0-9０-９,.]+万?円)/,
    /補助上限[:：]?\s*([0-9０-９,.]+万?円)/,
    /補助金額[:：]?\s*上限\s*([0-9０-９,.]+万?円)/,
  ];

  for (const re of limitPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      return m[1].replace(/\s+/g, '');
    }
  }

  // 「○○万円」をすべて拾って、最大値っぽいものを採用（保険）
  const yenMatches = [...text.matchAll(/([0-9０-９][0-9０-９,]*万?円)/g)].map(
    (m) => m[1],
  );
  if (yenMatches.length === 0) return '';

  // 数値部分だけ見て最大値を選ぶ
  let best = yenMatches[0];
  let bestVal = parseInt(best.replace(/[^\d]/g, ''), 10) || 0;
  for (const y of yenMatches.slice(1)) {
    const v = parseInt(y.replace(/[^\d]/g, ''), 10) || 0;
    if (v > bestVal) {
      bestVal = v;
      best = y;
    }
  }
  return best.replace(/\s+/g, '');
}

// ==============================
// 対象 抽出ロジック（「となり、…対象外です」を避ける）
// ==============================

export function extractTargetFromBody(body) {
  if (!body) return '';

  const text = body
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // 句点 or 改行でざっくり文に分割
  const sentences = text
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) return '';

  // 「対象」に関係しそうな文だけ候補にする
  const candidates = sentences.filter((s) =>
    /(対象者|補助対象者|補助対象事業者|補助対象|対象事業|対象となる|対象とする|対象企業|対象に|対象の)/.test(
      s,
    ),
  );

  if (candidates.length === 0) return '';

  // NG キーワード・NG っぽい先頭語
  const NG_WORD = /(対象外|対象とならない|対象としない|対象外です)/;
  const NG_PREFIX = /^(となり、|となり\s|ただし、|なお、|※|ただし|なお)/;

  // 優先したいパターン
  const PREFERRED = /(対象者|補助対象者|補助対象事業者|補助対象)/;

  let best = candidates[0];
  let bestScore = -999;

  for (const s of candidates) {
    let score = 0;

    // NG ワードを含む文は大きく減点（「第三者承継（M&A等）は対象外です」など）
    if (NG_WORD.test(s)) score -= 5;

    // 「となり、」「ただし、」などで始まる注意書きも減点
    if (NG_PREFIX.test(s)) score -= 3;

    // 「対象者」「補助対象者」などを含む文は加点
    if (PREFERRED.test(s)) score += 3;

    // 程よい長さ（説明文っぽい）の文を少し優遇
    if (s.length >= 15 && s.length <= 80) score += 1;

    // 長すぎる or 短すぎる文は微減点
    if (s.length < 8 || s.length > 120) score -= 1;

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  // 最後に長さを制限しておく（あまり長すぎると見づらいので）
  const MAX_LEN = 120;
  let out = best.trim();
  if (out.length > MAX_LEN) {
    out = out.slice(0, MAX_LEN) + '…';
  }
  return out;
}

// ==============================
// メタ情報バックフィル（I:上限額 / J:対象）
// ==============================

export async function backfillMetaFromBody() {
  const range = '案件DB!A1:Q';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    await logInfo('meta: メタ情報バックフィル対象なし（データ行なし）');
    return;
  }

  const headers = rows[0];
  const upperIdx = headers.indexOf('上限額');
  const targetIdx = headers.indexOf('対象');
  const bodyIdx = headers.indexOf('本文');

  if (upperIdx === -1 || targetIdx === -1 || bodyIdx === -1) {
    await logWarn(
      'meta: 案件DB に 上限額 / 対象 / 本文 の列見つからず（ヘッダ名を確認してください）',
    );
    return;
  }

  const updates = [];
  let processedRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const body = row[bodyIdx] || '';
    if (!body || body === '空欄') continue;

    const upperCell = row[upperIdx] || '';
    const targetCell = row[targetIdx] || '';

    // どちらも既に入っている行はスキップ
    if (upperCell && targetCell) continue;

    // heuristic 抽出
    let upper = upperCell;
    let target = targetCell;

    if (!upper) {
      upper = extractUpperLimitFromBody(body) || '';
    }
    if (!target) {
      target = extractTargetFromBody(body) || '';
    }

    const rowNumber = i + 1;

    if (upper && !upperCell) {
      updates.push({
        range: `案件DB!${columnNumberToLetter(upperIdx + 1)}${rowNumber}`,
        values: [[upper]],
      });
    }
    if (target && !targetCell) {
      updates.push({
        range: `案件DB!${columnNumberToLetter(targetIdx + 1)}${rowNumber}`,
        values: [[target]],
      });
    }

    if (updates.length > 0) {
      processedRows++;
    }
    if (processedRows >= META_BACKFILL_LIMIT) break;
  }

  if (updates.length === 0) {
    await logInfo('meta: メタ情報バックフィル対象なし');
    return;
  }

  await logInfo(`meta: メタ情報バックフィル開始 updates=${processedRows}`);

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  await logInfo(`meta: メタ情報バックフィル完了 updates=${processedRows}`);
}

// ==============================
// A1 形式列名ユーティリティ
// ==============================

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
