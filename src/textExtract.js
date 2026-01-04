// src/textExtract.js
// メタ情報（補助率・上限額・対象）を「本文(Q列)」から抽出して
// 案件DBシートの H/I/J 列を埋める処理をまとめたモジュールです。

import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

/**
 * ざっくり空白を整理
 */
function normalizeText(raw = '') {
  return String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * 日本語テキストを行ごとに分割（極端に短い行は前の行にくっつける）
 */
function splitToLogicalLines(text) {
  const lines = normalizeText(text).split('\n');
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (out.length && trimmed.length < 8) {
      out[out.length - 1] += ' ' + trimmed;
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * 補助率をざっくり抽出
 * 例: 「補助率：3分の2以内」「補助率 2/3」「補助率 1/2以内」など
 */
function extractRateFromBody(body) {
  const text = normalizeText(body);

  // 「補助率」の近くを優先して抜く
  const aroundRate = [];
  const rateIdx = text.indexOf('補助率');
  if (rateIdx !== -1) {
    const start = Math.max(0, rateIdx - 20);
    const end = Math.min(text.length, rateIdx + 80);
    aroundRate.push(text.slice(start, end));
  }

  // 予備として全体
  aroundRate.push(text);

  const ratePatterns = [
    /補助率[^0-9０-９分の\/]{0,10}([0-9０-９\/分の一二三四五六七八九十\.]+(?:％|%|以内)?)/,
    /([0-9０-９\/分の一二三四五六七八九十\.]+(?:％|%))[^。]*補助率/,
  ];

  for (const chunk of aroundRate) {
    for (const re of ratePatterns) {
      const m = chunk.match(re);
      if (m && m[1]) {
        return m[1].trim();
      }
    }
  }
  return '';
}

/**
 * 上限額をざっくり抽出
 * 例: 「上限額：100万円」「補助金の上限 560万円」など
 */
function extractLimitFromBody(body) {
  const text = normalizeText(body);

  const aroundLimit = [];
  const idx1 = text.indexOf('上限額');
  const idx2 = text.indexOf('補助金の上限');
  const idx = idx1 !== -1 ? idx1 : idx2;

  if (idx !== -1) {
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + 80);
    aroundLimit.push(text.slice(start, end));
  }
  aroundLimit.push(text);

  const moneyRe =
    /(?:上限額|補助金の上限|補助上限額?)[:：\s]*([0-9０-９,，]+(?:万円|万|円)?)/;

  for (const chunk of aroundLimit) {
    const m = chunk.match(moneyRe);
    if (m && m[1]) {
      return m[1].replace(/，/g, ',').trim();
    }
  }
  return '';
}

/**
 * 対象（誰が対象か）を抽出
 * ・「対象者」「対象企業」「対象事業」などの行を優先
 * ・「対象外」を含む行は基本的に除外
 * ・複数行にまたがる場合は2〜3行までつなぐ
 */
function extractTargetFromBody(body) {
  const lines = splitToLogicalLines(body);
  if (!lines.length) return '';

  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 「対象外」だけの注意書きは除外したい
    if (/対象外/.test(line) && !/対象者|対象企業|対象事業|補助対象/.test(line)) {
      continue;
    }

    // 対象を説明していそうな行
    if (
      /対象者|対象企業|対象事業|補助対象|県内中小企業|中小企業者|個人事業主/.test(
        line,
      )
    ) {
      // 次の行・その次の行も、あまり長くなり過ぎない範囲で連結
      let paragraph = line;
      for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
        const next = lines[j];
        if (next.length < 10) continue;
        if (/対象外/.test(next)) break;
        paragraph += ' ' + next;
        if (paragraph.length > 220) break;
      }
      candidates.push(paragraph);
    }
  }

  if (candidates.length) {
    // 一番短すぎず、かつ「対象外」を含まないものを優先
    candidates.sort((a, b) => a.length - b.length);
    const good = candidates.find((c) => !/対象外/.test(c)) || candidates[0];
    return good.slice(0, 240); // 念のため長さ制限
  }

  // どうしても見つからなければ、本文冒頭のそれっぽい一文だけ返す
  for (const line of lines) {
    if (line.length < 20) continue;
    if (/補助対象|県内中小企業|個人事業主|事業者/.test(line)) {
      return line.slice(0, 240);
    }
  }

  return '';
}

/**
 * 1行分の本文から、補助率・上限額・対象をまとめて抽出
 */
function extractMetaFromBody(body) {
  if (!body) return { rate: '', limit: '', target: '' };

  const rate = extractRateFromBody(body);
  const limit = extractLimitFromBody(body);
  const target = extractTargetFromBody(body);

  return { rate, limit, target };
}

/**
 * Q列「本文」から H/I/J（補助率・上限額・対象）を埋めるバックフィル。
 *
 * ポイント:
 *  - 「3つ全部空の行」だけでなく、H/I/J のどれか一つでも空なら対象
 *  - 既に値が入っている列は上書きしない（その列を削除した場合だけ再計算）
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

  const headers = rows[0] || [];
  const bodyIdx = headers.indexOf('本文');
  const rateIdx = headers.indexOf('補助率');
  const limitIdx = headers.indexOf('上限額');
  const targetIdx = headers.indexOf('対象');

  if (bodyIdx === -1 || rateIdx === -1 || limitIdx === -1 || targetIdx === -1) {
    await logWarn(
      'meta: 案件DBシートに 本文/補助率/上限額/対象 のいずれかの列が見つかりません',
    );
    return;
  }

  const rateColLetter = columnNumberToLetter(rateIdx + 1);
  const limitColLetter = columnNumberToLetter(limitIdx + 1);
  const targetColLetter = columnNumberToLetter(targetIdx + 1);

  const updates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const body = row[bodyIdx] || '';

    if (!body) continue; // 本文がない行はスキップ

    const hasRate = !!(row[rateIdx] && String(row[rateIdx]).trim());
    const hasLimit = !!(row[limitIdx] && String(row[limitIdx]).trim());
    const hasTarget = !!(row[targetIdx] && String(row[targetIdx]).trim());

    // 3つとも埋まっていれば何もしない
    if (hasRate && hasLimit && hasTarget) continue;

    const { rate, limit, target } = extractMetaFromBody(body);
    const rowNumber = i + 1; // 1-based

    // 補助率
    if (!hasRate && rate) {
      updates.push({
        range: `案件DB!${rateColLetter}${rowNumber}`,
        values: [[rate]],
      });
    }
    // 上限額
    if (!hasLimit && limit) {
      updates.push({
        range: `案件DB!${limitColLetter}${rowNumber}`,
        values: [[limit]],
      });
    }
    // 対象
    if (!hasTarget && target) {
      updates.push({
        range: `案件DB!${targetColLetter}${rowNumber}`,
        values: [[target]],
      });
    }
  }

  if (!updates.length) {
    await logInfo('meta: メタ情報バックフィル対象なし');
    return;
  }

  await logInfo(`meta: メタ情報バックフィル開始 updates=${updates.length}`);

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  await logInfo('meta: メタ情報バックフィル完了');
}

/**
 * 列番号(1=A, 2=B, ...)→列名(A, B, ..., AA) に変換
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
