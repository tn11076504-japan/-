// src/utils.js
import { URL } from 'node:url';

// 全角英数 → 半角
export function toHan(s = '') {
  return String(s).replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

// HTML タグ除去＋空白整形
export function stripTags(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 絶対 URL 化
export function canonicalizeUrl(href = '', baseUrl = '') {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

// 無意味なリンクをスキップ
export function shouldSkipHref(href = '') {
  const h = String(href).trim();
  if (!h) return true;
  if (h.startsWith('#')) return true;
  if (h.toLowerCase().startsWith('javascript:')) return true;
  return false;
}

// JST の今日（YYYY-MM-DD）
export function todayJst() {
  const now = new Date();
  const offsetMinutes = 9 * 60; // JST
  const jst = new Date(
    now.getTime() + (offsetMinutes - now.getTimezoneOffset()) * 60000
  );
  return jst.toISOString().slice(0, 10);
}
