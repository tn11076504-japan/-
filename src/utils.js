// src/utils.js
// 文字処理・URL処理などの共通ユーティリティ

/**
 * HTML からタグを除去してプレーンテキストを返す
 */
export function stripTags(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * a.href が無効っぽい場合に true を返す
 */
export function shouldSkipHref(href) {
  const s = String(href || '').trim();
  if (!s) return true;
  if (s === '#') return true;
  if (s.startsWith('#')) return true;
  if (/^javascript:/i.test(s)) return true;
  if (/^mailto:/i.test(s)) return true;
  return false;
}

/**
 * 相対 URL を base からの絶対 URL に直し、ハッシュなどを落として返す
 */
export function canonicalizeUrl(href, base) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, base);
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * 文字列を最大長で丸める。超えた場合は末尾に … を付与
 */
export function truncate(str, maxLen) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * URL からホスト名だけ取り出す
 */
export function hostOf(urlStr) {
  try {
    return new URL(String(urlStr || '')).host || '';
  } catch {
    return '';
  }
}

/**
 * 全角英数を半角にする（雑だが実用十分）
 */
export function toHan(str) {
  if (!str) return '';
  return String(str).replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  );
}
