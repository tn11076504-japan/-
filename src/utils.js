// 共通ユーティリティ

export function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (!s) return false;
    return ['1', 'true', 'yes', 'y', 'on', 't', 'はい', '有効'].includes(s);
  }
  return false;
}

export function normalizeSpace(str) {
  return String(str ?? '').replace(/\s+/g, ' ').trim();
}

export function canonicalizeUrl(href, baseUrl) {
  if (!href) return '';
  try {
    const u = new URL(href, baseUrl);
    return u.toString();
  } catch {
    return '';
  }
}

export function shouldSkipHref(href) {
  if (!href) return true;
  const h = href.trim();
  if (!h) return true;
  if (h.startsWith('#')) return true;
  if (h.toLowerCase().startsWith('javascript:')) return true;
  if (h.toLowerCase().startsWith('mailto:')) return true;
  return false;
}

// JSTの日付（YYYY-MM-DD）を返す
export function todayJst() {
  const now = new Date();
  // 現地タイムゾーン → JST(UTC+9) への補正
  const jstMillis = now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000;
  const jst = new Date(jstMillis);
  return jst.toISOString().slice(0, 10);
}

// id 用の短いランダム文字列
export function randomId(length = 4) {
  let out = '';
  while (out.length < length) {

  // HTML文字列からタグを除去してプレーンテキストにするヘルパー
export function stripTags(html) {
  if (!html) return '';

  return String(html)
    // script / style は丸ごと削除
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // 改行扱いにしたいタグ
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    // 残りのタグを削除
    .replace(/<[^>]+>/g, '')
    // ノーブレークスペースなどを普通のスペースに
    .replace(/\u00A0/g, ' ')
    // 連続スペースの圧縮
    .replace(/[ \t]+/g, ' ')
    // 連続空行を1つに
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
    out += Math.random().toString(36).slice(2);
  }
  return out.slice(0, length);
}
