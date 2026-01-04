// src/metaFix.js
// 既存の案件DBの行について、Q列「本文」から
// H=補助率、I=上限額、J=対象 を再計算して上書きする一括バックフィルスクリプト

import { sheetsClient, SHEET_ID, logInfo } from './sheets.js';
import { extractRate, extractLimit, extractTarget } from './textExtract.js';

// 0-based column index -> A1 形式の列名
function columnLetter(idx) {
  let n = idx + 1; // 1-based
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export async function backfillMetaForAllRows() {
  await logInfo('metaFix: 既存行メタ情報バックフィル開始');

  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '案件DB!A1:Q',
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    await logInfo('metaFix: 案件DB が空のため終了');
    return;
  }

  const headers = rows[0] || [];
  const idxBody = headers.indexOf('本文');
  const idxRate = headers.indexOf('補助率');
  const idxLimit = headers.indexOf('上限額');
  const idxTarget = headers.indexOf('対象');

  if (idxBody === -1 || idxRate === -1 || idxLimit === -1 || idxTarget === -1) {
    throw new Error('案件DB シートに 本文 / 補助率 / 上限額 / 対象 のいずれかの列がありません');
  }

  const updates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const body = row[idxBody];
    if (!body) continue; // 本文が空ならスキップ

    const newRate = extractRate(body) || '';
    const newLimit = extractLimit(body) || '';
    const newTarget = extractTarget(body) || '';

    // すべて空なら何もしない
    if (!newRate && !newLimit && !newTarget) continue;

    const curRate = row[idxRate] || '';
    const curLimit = row[idxLimit] || '';
    const curTarget = row[idxTarget] || '';

    // 値が変わらない行はスキップ
    if (
      newRate === curRate &&
      newLimit === curLimit &&
      newTarget === curTarget
    ) {
      continue;
    }

    const rowNumber = i + 1; // 1-based
    const startCol = columnLetter(idxRate);   // H 列のはず
    const endCol   = columnLetter(idxTarget); // J 列のはず

    updates.push({
      range: `案件DB!${startCol}${rowNumber}:${endCol}${rowNumber}`,
      values: [[newRate, newLimit, newTarget]],
    });
  }

  if (updates.length === 0) {
    await logInfo('metaFix: 更新対象なし updates=0');
    return;
  }

  // まとめて書き込み（大きくなりすぎないように分割）
  const BATCH_SIZE = 200;
  let total = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: batch,
      },
    });
    total += batch.length;
  }

  await logInfo(`metaFix: 既存行メタ情報バックフィル完了 updates=${total}`);
}

// このファイルを「node src/metaFix.js」で直接実行したとき用のエントリーポイント
backfillMetaForAllRows()
  .then(() => {
    // 明示的に終了
    // eslint-disable-next-line no-process-exit
    process.exit(0);
  })
  .catch((err) => {
    console.error('metaFix: error', err);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
