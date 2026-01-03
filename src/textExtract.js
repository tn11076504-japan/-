// src/textExtract.js
//
// Q列「本文」のテキストから
// ・補助率
// ・上限額
// ・対象
// をざっくり抜き出すユーティリティ。
// うまく取れない場合は空文字を返す。

export function extractSubsidyInfo(bodyText) {
  const text = (bodyText || '').toString();
  const result = {
    rate: '',
    limit: '',
    target: '',
  };

  if (!text) return result;

  // 改行などを潰して正規表現を当てやすくする
  const normalized = text.replace(/\s+/g, ' ').trim();

  // ■ 補助率
  // 例:
  //   補助率: 1/2以内（上限100万円）
  //   補助率 2/3以内
  const rateMatch =
    normalized.match(/補助率[：:は]?\s*([^\n。\r)]+)\)?/) ||
    normalized.match(/支援内容・条件[^。]*?補助率[：:は]?\s*([^\n。\r)]+)\)?/);

  if (rateMatch) {
    result.rate = rateMatch[1].trim();
  }

  // ■ 上限額
  // 例:
  //   上限額: 100万円
  //   補助上限額 50万円
  const limitMatch =
    normalized.match(/(?:補助上限額|補助限度額|上限額|上限)[：:は]?\s*([^\n。\r)]+)\)?/);

  if (limitMatch) {
    result.limit = limitMatch[1].trim();
  }

  // ■ 対象
  // 例:
  //   対象者: 県内中小企業者
  //   補助対象者 県内に事業所を有する中小企業者
  const targetMatch =
    normalized.match(/(?:対象者|補助対象者|対象事業者|対象)[：:は]?\s*([^\n。\r)]+)\)?/);

  if (targetMatch) {
    result.target = targetMatch[1].trim();
  }

  return result;
}
