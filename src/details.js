import fetch from 'node-fetch';
import { stripTags } from './utils.js';

// URL から HTML を取得して本文テキストを返す。
// 文字数が長すぎる場合はシートの制限を考慮してカット。
export async function fetchBodyText(url) {
  if (!url) return '';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const rawText = stripTags(html) || '';

  // 改行やタブを整理して、シンプルなテキストに
  const normalized = rawText.replace(/\s+/g, ' ').trim();

  // Google スプレッドシートの 1 セルは ~5万文字程度が上限なので、少し余裕を持ってカット
  const MAX_LEN = 40000;
  if (normalized.length > MAX_LEN) {
    return normalized.slice(0, MAX_LEN);
  }
  return normalized;
}
