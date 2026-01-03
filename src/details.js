// src/details.js
//
// 役割:
//   - 案件DBシートを読み込む
//   - Q列「本文」が空の行の URL からページを取得
//   - HTML からプレーンテキストを作って Q 列に保存
//   - うまく取れなかった場合は「空欄」と書き込み
//
// 備考:
//   - adoptedRecords は今のところ使わず、
//     「Q列が空の行」だけを一括で対象にします。

import { sheetsClient as sheets, SHEET_ID, logInfo, logWarn } from './sheets.js';

/**
 * HTML からプレーンテキストっぽいものを作る簡易関数
 */
function htmlToPlainText(html) {
  if (!html) return '';

  return html
    // script/style を削除
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // タグをスペースに
    .replace(/<[^>]+>/g, ' ')
    // 連続空白を1つに
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * URL からページを取得してプレーンテキスト化
 * 取得に失敗したら null を返す
 */
async function fetchPageText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const text = htmlToPlainText(html);
    return text || null;
  } catch (err) {
    await logWarn(`detail fetch error url=${url} error=${err.message}`);
    return null;
  }
}

/**
 * adoptedRecords は今は未使用。
 * src（ソース行オブジェクト）の URL をもとに、同じドメインの案件だけを対象にする。
 */
export async function enrichRecordsWithDetails(adoptedRecords, src) {
  // --- 1. 案件DBシート全体を取得 ---
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '案件DB!A1:Q', // Q列まで（本文まで）取得
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    await logInfo('detail summary: no rows in 案件DB');
    return;
  }

  const headers = rows[0];
  const urlIdx = headers.indexOf('URL');
  const bodyIdx = headers.indexOf('本文');

  if (urlIdx === -1 || bodyIdx === -1) {
    await logWarn('案件DB シートに URL 列または 本文(Q列) が見つかりません');
    return;
  }

  // --- 2. この src に対応するドメインを決める ---
  const srcUrl = src?.['URL'] || '';
  let originPrefix = '';

  try {
    if (srcUrl) {
      const u = new URL(srcUrl);
      originPrefix = u.origin; // 例: https://www.okinawa-ric.jp
    }
  } catch {
    // URL パースに失敗しても、全件対象にするだけなので致命的ではない
    originPrefix = '';
  }

  // --- 3. Q列「本文」が空で、かつドメインが一致する行をターゲットにする ---
  const targets = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const url = row[urlIdx] || '';
    const bodyCell = ((row[bodyIdx] ?? '') + '').trim(); // すでに何か入っていればスキップ

    if (!url) continue;

    // src に URL が設定されていて、originPrefix が決まっている場合は、
    // 同じドメインの URL だけを対象にする
    if (originPrefix && !url.startsWith(originPrefix)) {
      continue;
    }

    // すでに本文セルに何か入っている行は対象外（「空欄」も含めて）
    if (bodyCell !== '') {
      continue;
    }

    targets.push({
      rowIndex: i + 1, // シート上の行番号（1始まり）
      url,
    });
  }

  if (targets.length === 0) {
    await logInfo(
      `detail summary source=${src?.['名称'] || ''} total=0 fetched=0 empty=0`
    );
    return;
  }

  // --- 4. 対象行ごとにページを取得して Q列に書き込む ---
  const updates = [];
  let fetchedCount = 0;
  let emptyCount = 0;

  for (const t of targets) {
    const text = await fetchPageText(t.url);
    let value;

    if (text && text.trim()) {
      value = text;
      fetchedCount++;
    } else {
      // 取得できなかった / 本文が見つからなかった場合
      value = '空欄';
      emptyCount++;
    }

    updates.push({
      range: `案件DB!Q${t.rowIndex}`,
      values: [[value]],
    });
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
  }

  await logInfo(
    `detail summary source=${src?.['名称'] || ''} total=${targets.length} fetched=${fetchedCount} empty=${emptyCount}`
  );
}
