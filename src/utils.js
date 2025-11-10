// src/utils.js
import axios from 'axios';

// HTMLタグや余分な空白をざっくり除去
export function stripTags(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 相対URL -> 絶対URL
export function canonicalizeUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

// aタグで無視したいリンクを弾く
export function shouldSkipHref(href) {
  const h = String(href || '').trim();
  if (!h) return true;
  if (h.startsWith('#')) return true;
  if (/^#group\d+$/i.test(h)) return true;
  const l = h.toLowerCase();
  if (l.startsWith('javascript:')) return true;
  if (l.startsWith('mailto:')) return true;
  if (l.startsWith('tel:')) return true;
  return false;
}

// 文字列を n 文字で省略
export function truncate(s, n) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// （一時対応）PDFの中身テキスト取得は無効化
// もし他ファイルから呼ばれても空文字を返すだけにして落ちないようにする
export async function maybeReadPdfText(/* url */) {
  return '';
}

// もし将来PDFテキストを使いたい場合の雛形：
// import pdfParse from 'pdf-parse';
// export async function maybeReadPdfText(url) {
//   if (!/\.pdf(?:$|\?)/i.test(url || '')) return '';
//   try {
//     const res = await axios.get(url, {
//       responseType: 'arraybuffer',
//       timeout: 15000,
//       maxContentLength: 10 * 1024 * 1024,
//       validateStatus: s => s < 400,
//     });
//     const buf = Buffer.from(res.data);
//     const parsed = await pdfParse(buf);
//     return stripTags(parsed.text || '');
//   } catch {
//     return '';
//   }
// }
