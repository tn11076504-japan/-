// src/utils.js

/**
 * 全角英数字・記号 → 半角に変換
 * 例: "ＡＢＣ１２３　" → "ABC123 "
 */
export function toHan(value) {
  if (value == null) return '';
  return String(value)
    // ASCII 全角 → 半角
    .replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // 全角スペース → 半角スペース
    .replace(/　/g, ' ');
}

/**
 * HTMLタグ除去＋空白整理
 * 例: "<p>テキスト<br>です</p>" → "テキスト です"
 */
export function stripTags(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')  // br は改行扱い
    .replace(/<[^>]*>/g, '')       // その他タグ除去
    .replace(/\s+/g, ' ')          // 連続空白を 1 個に
    .trim();
}

/**
 * 相対URLを絶対URLに正規化
 * 例: canonicalizeUrl("/path", "https://example.com/base/")
 */
export function canonicalizeUrl(href, base) {
  if (!href) return '';
  try {
    const url = new URL(href, base);
    return url.toString();
  } catch (e) {
    // 不正なURLは無視
    return '';
  }
}

/**
 * 明らかにリンクとして不要な href を弾く
 * - 空文字
 * - "#" や "#xxx"
 * - "javascript:" や "mailto:"
 */
export function shouldSkipHref(href = '') {
  const h = String(href).trim();
  if (!h) return true;
  if (h === '#') return true;
  if (h.startsWith('#')) return true;
  if (h.toLowerCase().startsWith('javascript:')) return true;
  if (h.toLowerCase().startsWith('mailto:')) return true;
  return false;
}

/**
 * 文字列を指定長でカットして "…" を付ける
 */
export function truncate(text, max = 160) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
