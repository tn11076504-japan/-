// src/date.js
// 締切日・開始日などの日付抽出ユーティリティ

import { toHan } from './utils.js';

/**
 * テキストから「募集は終了」「受付は終了」などの終了フラグを検出
 */
export function detectClosed(text) {
  const s = String(text || '');
  return /(受付|募集)[^。]*終了|締切[^。]*過ぎ|申請受付を終了しました/.test(s);
}

/**
 * 西暦 (YYYY) / 月 (1-12) / 日 (1-31) を 'YYYY-MM-DD' へ
 */
export function normalizeDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return '';
  const mm = m.toString().padStart(2, '0');
  const dd = d.toString().padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/**
 * 令和表記を西暦に変換する簡易版
 * 例: '令和7年1月5日' → 2025-01-05
 */
function parseReiwaDate(text) {
  const m = text.match(/令和\s*([0-9０-９]+)\s*年\s*([0-9０-９]+)\s*月\s*([0-9０-９]+)\s*日/);
  if (!m) return '';
  const r = Number(toHan(m[1]));
  const mo = Number(toHan(m[2]));
  const d = Number(toHan(m[3]));
  if (!r || !mo || !d) return '';
  const year = 2018 + r; // 令和1年=2019年
  return normalizeDate(year, mo, d);
}

/**
 * '2025年12月20日' / '2025/12/20' / '2025-12-20' などを検出
 */
function parseSimpleDate(text) {
  const s = toHan(text);
  // 2025年12月20日
  let m = s.match(/(20[0-9]{2})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日/);
  if (m) {
    return normalizeDate(m[1], m[2], m[3]);
  }
  // 2025/12/20 or 2025-12-20
  m = s.match(/(20[0-9]{2})[\/\-\.]([0-9]{1,2})[\/\-\.]([0-9]{1,2})/);
  if (m) {
    return normalizeDate(m[1], m[2], m[3]);
  }
  return '';
}

/**
 * 募集開始日抽出（現状は未使用だが将来のため stub 実装）
 * 必要になったら詳細実装を追加する想定
 */
export function extractStartDate(text, customRegex = '', mode = 'LOOSE') {
  // いったん未実装扱いで空文字を返す
  // 将来「募集期間：2025年1月1日〜2月29日」から前半だけ抜くなどの処理を入れる
  void text;
  void customRegex;
  void mode;
  return '';
}

/**
 * 締切日を賢く（しかし安全に）推定する
 * - customRegex があれば優先
 * - なければ Reiwa → 年月日 → YYYY/MM/DD の順で探す
 * @param {string} text
 * @param {string} customRegex ソースシート「締切抽出REGEX」列
 * @param {string} mode 'STRICT' | 'LOOSE'
 */
export function extractDeadlineSmart(text, customRegex = '', mode = 'LOOSE') {
  const s = String(text || '');

  // 1) カスタム正規表現（ソース側で調整できる）
  if (customRegex) {
    try {
      const re = new RegExp(customRegex);
      const m = s.match(re);
      if (m && m[1]) {
        const fromCustom = parseSimpleDate(m[1]) || parseReiwaDate(m[1]);
        if (fromCustom) return fromCustom;
      }
    } catch {
      // REGEX が壊れていても落ちないように握りつぶす
    }
  }

  // 2) テキスト全体から Reiwa → 年月日 → YYYY/MM/DD の順で探す
  const reiwa = parseReiwaDate(s);
  if (reiwa) return reiwa;

  const simple = parseSimpleDate(s);
  if (simple) return simple;

  // mode が STRICT のときは、あいまい判定をしない
  if (String(mode || '').toUpperCase() === 'STRICT') {
    return '';
  }

  // 3) 「〜まで」「締切」近辺の日付だけを緩めに見る（LOOSE 用）
  const around = s.match(/(.{0,16}(締切|まで).{0,16})/);
  if (around) {
    const candidate = around[1];
    const dd = parseReiwaDate(candidate) || parseSimpleDate(candidate);
    if (dd) return dd;
  }

  return '';
}

/**
 * 「今日 (JST) の日付」を 'YYYY-MM-DD' で返す
 */
export function todayJst() {
  const now = new Date();
  const tzOffsetMinutes = 9 * 60; // JST (UTC+9)
  const jst = new Date(now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset()) * 60000);
  return jst.toISOString().slice(0, 10);
}
