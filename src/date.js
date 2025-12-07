// src/date.js
import { todayJst } from './utils.js';

// テキストから締切日っぽい日付を抜く（かなり素朴な版）
export function extractDeadlineSmart(text = '', regexStr = '', mode = 'LOOSE') {
  const src = String(text);

  // 設定シートから正規表現が来ていれば優先
  if (regexStr) {
    try {
      const re = new RegExp(regexStr);
      const m = src.match(re);
      if (m && m[0]) {
        return normalizeDate(m[0]);
      }
    } catch {
      // REGEX が壊れていても落とさない
    }
  }

  // デフォルト: 2025/03/31, 2025-03-31, 2025年3月31日 だけ拾う
  const reDefault =
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日号]?/;
  const m = src.match(reDefault);
  if (!m) return '';

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return normalizeDate(`${y}-${mo}-${d}`);
}

// YYYY,YYYY/M/D などを YYYY-MM-DD に揃える
export function normalizeDate(str = '') {
  const s = String(str).trim();
  if (!s) return '';

  // すでに ISO ぽい
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(s)) return s;

  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日号]?/);
  if (!m) return '';

  const y = Number(m[1]);
  const mo = String(Number(m[2])).padStart(2, '0');
  const d = String(Number(m[3])).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// たとえば「受付は終了しました」を将来チェックしたくなった時用
export function detectClosed(text = '') {
  const t = String(text);
  return /終了しました|受付終了|募集は終了/i.test(t);
}

// start 日は現状使っていないがインターフェースだけ置いておく
export function extractStartDate(_text = '') {
  return '';
}

// 共有の「今日」
export function today() {
  return todayJst();
}
