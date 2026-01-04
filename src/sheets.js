// ==============================
// メタ情報バックフィル用
// ==============================

// 募集開始・締切日・補助率・対象 を本文(Q列)から再計算したい行を探す。
//   - Q列「本文」が入っている
//   - かつ、
//       1) J列「対象」が空  または
//       2) J列「対象」が「となり、」「売り手のみ」などで始まる
// を対象にする。
export async function findRecordsNeedingMeta(limit = 50) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '案件DB!A1:Q',
  });

  const rows = res.data.values || [];
  if (rows.length === 0) return [];

  const headers = rows[0] || [];

  const startIdx  = headers.indexOf('募集開始');
  const endIdx    = headers.indexOf('締切日');
  const rateIdx   = headers.indexOf('補助率');
  const targetIdx = headers.indexOf('対象');
  const bodyIdx   = headers.indexOf('本文');

  if (
    startIdx === -1 ||
    endIdx === -1 ||
    rateIdx === -1 ||
    targetIdx === -1 ||
    bodyIdx === -1
  ) {
    throw new Error(
      '案件DB シートに 募集開始 / 締切日 / 補助率 / 対象 / 本文 のいずれかの列がありません'
    );
  }

  // 「となり、〜」「売り手のみ〜」で始まる行は「変な対象」とみなす
  const BAD_TARGET_RE = /^(となり、|売り手のみ)/;

  const targets = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const body   = row[bodyIdx]   || '';
    const target = row[targetIdx] || '';

    // 本文が無い行はそもそも再計算できないので除外
    if (!body) continue;

    const hasNoTarget  = !target;
    const hasBadTarget = !!target && BAD_TARGET_RE.test(target);

    if (hasNoTarget || hasBadTarget) {
      targets.push({
        rowNumber: i + 1, // シート上の行番号（1始まり）
        body,
      });

      if (targets.length >= limit) break;
    }
  }

  return targets;
}
