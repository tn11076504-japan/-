// src/utils.js
import { URL } from 'url';

/**
 * HTML からタグを削除してテキストだけにする
 */
export function stripTags(html = '') {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 相対 URL を絶対 URL に変換
 */
export function canonicalizeUrl(href, base) {
  try {
    if (!href) return '';
    const u = new URL(href, base);
    // #だけのリンクなどは捨てる
    if (!u.protocol.startsWith('http')) return '';
    return u.toString();
  } catch (e) {
    return '';
  }
}

/**
 * メールリンク・JavaScript など無視したい href を弾く
 */
export function shouldSkipHref(href = '') {
  const h = href.trim().toLowerCase();
  if (!h) return true;
  if (h.startsWith('#')) return true;
  if (h.startsWith('javascript:')) return true;
  if (h.startsWith('mailto:')) return true;
  return false;
}

/**
 * 文字列を指定長でトリム
 */
export function truncate(s, maxLen) {
  const txt = String(s || '');
  if (txt.length <= maxLen) return txt;
  return txt.slice(0, maxLen - 1) + '…';
}

/**
 * URL からホスト名だけ取り出す
 */
export function hostOf(url = '') {
  try {
    const u = new URL(url);
    return u.hostname || '';
  } catch (e) {
    return '';
  }
}

/**
 * JST タイムスタンプ（YYYY-MM-DD HH:MM:SS）
 */
export function nowJstTimestamp() {
  const now = new Date();
  const jst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
  return jst.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * JST の日付（YYYY-MM-DD）
 */
export function todayJstDate() {
  const now = new Date();
  const jst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
  return jst.toISOString().slice(0, 10);
}
