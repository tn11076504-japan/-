// src/date.js
// タイトルや本文のテキストから「締切日っぽい日付」を抜き出すヘルパー

import { toHan } from './utils.js';

/**
 * テキストから締切日を推定して "YYYY-MM-DD" 文字列で返す
 *
 * @param {string} text       タイトル＋本文など
 * @param {string} userRegex  設定シート / ソースシートで指定した正規表現（空でも可）
 * @param {string} mode       'STRICT' | 'LOOSE' など（現状はほぼ未使用）
 */
export function extractDeadlineSmart(text, userRegex, mode = 'LOOSE') {
  const src = toHan(String(text ?? ''));

  // 1) ユーザー指定の正規表現があれば優先
  if (userRegex) {
    try {
      const re = new RegExp(userRegex);
      const m = src.match(re);
      if (m && m[0]) {
        const d = parseDateLike(m[0]);
        if (d) return d;
      }
    } catch (e) {
      // userRegex が壊れていても落とさない
    }
  }

  // 2) 典型的な "2025年10月31日" / "2025/10/31" パターン
  let m = src.match(/(\d{4})[年\/\.](\d{1,2})[月\/\.](\d{1,2})日?/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const f = formatDate(y, mo, d);
    if (f) return f;
  }

  // 3) "10月31日" だけ書いてあるケース → 今年として解釈（過ぎていたら来年）
  m = src.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const now = todayBaseDate();
    let y = now.getFullYear();
    const mo = Number(m[1]);
    const d = Number(m[2]);
    let f = formatDate(y, mo, d);
    if (!f) return '(不明)';

    // すでに過去の日付なら翌年扱い
    if (new Date(f) < new Date(now.toISOString().slice(0, 10))) {
      y += 1;
      f = formatDate(y, mo, d);
    }
    if (f) return f;
  }

  // どうしても拾えない場合
  return '(不明)';
}

function todayBaseDate() {
  const now = new Date();
  const tzOffsetMinutes = 9 * 60; // JST
  const jst = new Date(
    now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset()) * 60000
  );
  return jst;
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatDate(y, m, d) {
  if (!y || !m || !d) return '';
  if (m < 1 || m > 12) return '';
  if (d < 1 || d > 31) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * "2025/10/31" や "2025年10月31日" のような文字列が渡ってきたと想定してパースする
 */
function parseDateLike(s) {
  const str = String(s ?? '');
  let m = str.match(/(\d{4})[年\/\.](\d{1,2})[月\/\.](\d{1,2})日?/);
  if (m) {
    return formatDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  m = str.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const base = todayBaseDate();
    return formatDate(base.getFullYear(), Number(m[1]), Number(m[2]));
  }
  return '';
}
