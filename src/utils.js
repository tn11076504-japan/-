// src/utils.js
// 汎用ユーティリティ関数（全部 named export）

// 全角→半角（数字・英字・一部記号）
export function toHan(input = "") {
  return String(input).replace(/[！-～]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

// 余計な空白を整理
export function normalizeSpace(input = "") {
  return String(input)
    .replace(/\s+/g, " ")
    .trim();
}

// HTML からテキストだけを取り出す
export function stripTags(html) {
  if (!html) return "";

  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// 相対URLを絶対URLに正規化
export function canonicalizeUrl(href, baseUrl) {
  const raw = String(href || "").trim();
  if (!raw) return "";

  try {
    if (raw.startsWith("//")) {
      return "https:" + raw;
    }
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    if (!baseUrl) return raw;
    const u = new URL(raw, baseUrl);
    return u.toString();
  } catch (_) {
    return raw;
  }
}

// aタグの href としてスキップすべきか
export function shouldSkipHref(href) {
  if (!href) return true;
  const s = String(href).trim();
  if (!s || s === "#" || s.startsWith("#")) return true;
  const lower = s.toLowerCase();
  if (lower.startsWith("javascript:")) return true;
  if (lower.startsWith("mailto:")) return true;
  if (lower.startsWith("tel:")) return true;
  return false;
}

// 指定長でカットして末尾に "…" を付ける
export function truncate(str, maxLen) {
  const s = String(str || "");
  const n = Number(maxLen) || 0;
  if (!n || s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// URL からホスト名を取り出す
export function hostOf(urlStr) {
  try {
    const u = new URL(String(urlStr));
    return u.host || "";
  } catch (_) {
    return "";
  }
}

// JST の「今日の日付」(YYYY-MM-DD) を返す
export function todayJst() {
  const now = new Date();
  const tzOffsetMinutes = 9 * 60; // JST(UTC+9)
  const jst = new Date(
    now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset()) * 60000
  );
  return jst.toISOString().slice(0, 10);
}

// 簡易なランダムID（案件DBのA列などで使用）
export function randomId(length = 4) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// Promise ベースの sleep（必要なら使用）
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
