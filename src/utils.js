// src/utils.js
// 共通ユーティリティ関数群（HTML整形・URL整形・文字種変換など）

/**
 * HTML タグを除去し、空白をきれいに整形したテキストを返す
 */
export function stripTags(value = '') {
  const str = String(value ?? '');
  return str
    .replace(/<[^>]*>/g, ' ')   // タグ除去
    .replace(/&nbsp;/gi, ' ')   // NBSP をスペースへ
    .replace(/\s+/g, ' ')       // 連続スペースを 1 個に
    .trim();
}

/**
 * 相対 URL を絶対 URL に正規化する
 */
export function canonicalizeUrl(href, baseUrl) {
  const raw = String(href ?? '').trim();
  if (!raw) return '';

  // すでに絶対 URL の場合
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  try {
    const base = new URL(String(baseUrl ?? '').trim());
    const abs = new URL(raw, base);
    return abs.href;
  } catch (e) {
    return '';
  }
}

/**
 * a[href] を拾う時に「スキップしたいリンク」を判定する
 */
export function shouldSkipHref(href) {
  const s = String(href ?? '').trim();
  if (!s) return true;
  if (s.startsWith('#')) return true;
  if (/^javascript:/i.test(s)) return true;
  if (/^mailto:/i.test(s)) return true;
  return false;
}

/**
 * 指定した長さに収まるように末尾を切り詰める（オーバー時は … を付与）
 */
export function truncate(value, maxLength) {
  const str = String(value ?? '');
  const n = Number(maxLength) || 0;
  if (n <= 0) return str;
  if (str.length <= n) return str;
  if (n <= 1) return str.slice(0, n);
  return str.slice(0, n - 1) + '…';
}

/**
 * 全角数字（０〜９）を半角数字（0〜9）に変換する
 * 日付パース前の前処理に使う
 */
export function toHan(value) {
  const str = String(value ?? '');
  return str.replace(/[０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

/**
 * ざっくり空判定
 */
export function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

export function notEmpty(v) {
  return !isEmpty(v);
}

/**
 * JST(UTC+9) の yyyy-MM-dd を返す
 * いくつかのファイルで共通利用したい場合に使える
 */
export function todayJst() {
  const now = new Date();
  const tzOffsetMinutes = 9 * 60; // JST
  const jst = new Date(
    now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset()) * 60000
  );
  return jst.toISOString().slice(0, 10);
}
