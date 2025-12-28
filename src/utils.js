// src/utils.js
// 汎用ユーティリティ関数群（全部 named export）

// 全角→半角（数字・英字・一部記号）
// 例: "１２３ＡＢｃ" → "123ABc"
export function toHan(input = "") {
  return String(input).replace(/[！-～]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

// 余計な空白を整理（タブ→スペース、多重スペース→1つ）
export function normalizeSpace(input = "") {
  return String(input)
    .replace(/\s+/g, " ")
    .trim();
}

// HTML からテキストだけを取り出す
// - <script>, <style> ブロックは丸ごと削除
// - <br>, </p>, </div>, </li>, </tr>, </h1>〜</h6> は改行扱い
// - 残りのタグは削除
export function stripTags(html) {
  if (!html) return "";

  return String(html)
    // script / style を除去
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // 改行扱いのタグ
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    // 残りのタグを削除
    .replace(/<[^>]+>/g, "")
    // ノーブレークスペースなど
    .replace(/\u00A0/g, " ")
    // タブなどをスペースに寄せる
    .replace(/[ \t]+/g, " ")
    // 連続する空行を1つに
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// URL を絶対URLに正規化
// href が "http..." ならそのまま
// 相対パスなら baseUrl をもとに解決
export function canonicalizeUrl(href, baseUrl) {
  const raw = String(href || "").trim();
  if (!raw) return "";

  try {
    // //example.com のようなスキーム省略
    if (raw.startsWith("//")) {
      return "https:" + raw;
    }
    // すでに http(s) で始まっていればそのまま
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    if (!baseUrl) return raw;
    const u = new URL(raw, baseUrl);
    return u.toString();
  } catch (e) {
    return raw;
  }
}

// aタグの href として明らかに無視して良いものかどうか
export function shouldSkipHref(href) {
  if (!href) return true;
  const s = String(href).trim();
  if (!s || s === "#" || s.startsWith("#")) return true;
  if (s.toLowerCase().startsWith("javascript:")) return true;
  if (s.toLowerCase().startsWith("mailto:")) return true;
  if (s.toLowerCase().startsWith("tel:")) return true;
  return false;
}

// 文字列を指定長でカット（末尾に "…" を付ける）
export function truncate(str, maxLen) {
  const s = String(str || "");
  const n = Number(maxLen) || 0;
  if (!n || s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// URL からホスト名だけを取り出す
// 例: https://www.pref.okinawa.lg.jp/... → www.pref.okinawa.lg.jp
export function hostOf(urlStr) {
  try {
    const u = new URL(String(urlStr));
    return u.host || "";
  } catch (e) {
    return "";
  }
}

// Promiseベースの sleep（必要なら使う）
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
