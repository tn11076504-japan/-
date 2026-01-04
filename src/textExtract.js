// ==============================
// 本文から「対象」テキストを抽出
// ==============================

/**
 * 本文テキストから「対象」っぽい行だけを抽出して 1 つの文字列にまとめる。
 * 「となり、〜」「売り手のみ〜」で始まる行はノイズとして除外する。
 */
export function extractTargetsFromBody(bodyText) {
  if (!bodyText) return '';

  const lines = bodyText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // ノイズ判定用のパターン
  const BAD_START_RE = /^(となり、|売り手のみ)/;

  const targetLines = lines.filter((line) => {
    // 「となり、〜」「売り手のみ〜」で始まる行は除外
    if (BAD_START_RE.test(line)) return false;

    // 「対象者」「対象事業」「補助対象者」などを含む行を優先して拾う
    if (/(対象者|対象事業|補助対象事業|補助対象者|補助対象経費)/.test(line)) {
      return true;
    }

    // ここに追加のルールを足してもよい（必要になったら拡張）
    return false;
  });

  return targetLines.join('\n');
}
