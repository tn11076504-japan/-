// src/date.js
// 日付関連のユーティリティ
// - detectClosed: 「募集終了」などを検知
// - extractDeadlineSmart: テキストから締切日を抽出
// - extractStartDate: テキストから開始日を抽出
// - normalizeDate: 日付文字列を YYYY-MM-DD に正規化

import { toHan } from './utils.js';

// 「終了」を示すキーワード（必要に応じて増やしてOK）
const CLOSED_KEYWORDS = [
  '受付は終了しました',
  '申請受付は終了しました',
  '募集は終了しました',
  '募集を終了しました',
  '募集を締め切りました',
  '公募は終了しました'
];

/**
 * テキストから「募集終了」フラグを検知
 * @param {string} text
 * @returns {boolean}
 */
export function detectClosed(text) {
  const s = toHan(String(text));
  return CLOSED_KEYWORDS.some(k => s.includes(k));
}

/**
 * 日付文字列を YYYY-MM-DD に正規化
 * 対応例:
 *   2025年3月1日
 *   2025/3/1
 *   2025-03-01
 * @param {string} str
 * @returns {string} YYYY-MM-DD or ''
 */
export function normalizeDate(str) {
  if (!str) return '';

  // 全角→半角などを揃えてから処理
  const s = toHan(String(str))
    .replace(/年/g, '/')
    .replace(/月/g, '/')
    .replace(/日/g, '');

  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return '';

  const year = m[1];
  const month = String(m[2]).padStart(2, '0');
  const day = String(m[3]).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * テキストから締切日を抽出（カスタム正規表現＋フォールバック）
 * @param {string} text           元テキスト（タイトル＋本文など）
 * @param {string} customRegexStr 設定シートの「締切抽出REGEX」
 * @param {string} mode           まだ使ってないが 'STRICT' / 'LOOSE' など拡張用
 * @returns {string} YYYY-MM-DD / 'CLOSED' / ''
 */
export function extractDeadlineSmart(text, customRegexStr, mode = 'LOOSE') {
  const body = toHan(String(text));

  // 1) 募集終了キーワードがあれば 'CLOSED'
  if (detectClosed(body)) {
    return 'CLOSED';
  }

  // 2) カスタム正規表現が指定されていればそれを優先
  if (customRegexStr) {
    try {
      const re = new RegExp(customRegexStr);
      const m = body.match(re);
      if (m) {
        // マッチ全体から日付を正規化
        return normalizeDate(m[0]);
      }
    } catch (e) {
      // REGEXが壊れていても落とさない
      console.warn('invalid custom deadline regex:', customRegexStr, e.message);
    }
  }

  // 3) フォールバック: テキスト中の「最後の」日付らしきものを締切とみなす
  const dates = body.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?/g);
  if (dates && dates.length > 0) {
    const last = dates[dates.length - 1];
    return normalizeDate(last);
  }

  return '';
}

/**
 * テキストから「開始日」をざっくり抽出
 * 例: 2025年4月1日から受付開始
 * @param {string} text
 * @returns {string} YYYY-MM-DD or ''
 */
export function extractStartDate(text) {
  const body = toHan(String(text));

  // 「〜から」の直前にある日付を拾うイメージ
  const m = body.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?から?/);
  if (!m) return '';

  return normalizeDate(m[0]);
}
