// 日付系ユーティリティ
import { normalizeSpace } from './utils.js';

function normalizeDateParts(y, m, d) {
  const yy = parseInt(String(y), 10);
  const mm = parseInt(String(m), 10);
  const dd = parseInt(String(d), 10);
  if (!yy || !mm || !dd) return '';
  return (
    yy.toString().padStart(4, '0') +
    '-' +
    mm.toString().padStart(2, '0') +
    '-' +
    dd.toString().padStart(2, '0')
  );
}

export function extractDates(text, customRegex) {
  const src = normalizeSpace(text || '');
  if (!src) return [];
  const pattern =
    customRegex && customRegex.trim()
      ? new RegExp(customRegex, 'g')
      : /(\d{4})[./年](\d{1,2})[./月](\d{1,2})/g;

  const out = [];
  let m;
  while ((m = pattern.exec(src))) {
    const d = normalizeDateParts(m[1], m[2], m[3]);
    if (d) out.push(d);
  }
  return out;
}

export function extractFirstDate(text, customRegex) {
  const arr = extractDates(text, customRegex);
  return arr[0] || '';
}

export function extractDateRange(text, customRegex) {
  const arr = extractDates(text, customRegex);
  if (arr.length >= 2) return [arr[0], arr[1]];
  if (arr.length === 1) return ['', arr[0]];
  return ['', ''];
}

// ひとまず「最初に見つかった日付」を締切として返す簡易版
export function extractDeadlineSmart(text, customRegex) {
  return extractFirstDate(text, customRegex);
}
