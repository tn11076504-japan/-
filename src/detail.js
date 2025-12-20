// src/detail.js
import { toHan } from './utils.js';

// 補助率（例: 補助率 2/3, 補助率 50%）
export function extractRate(text = '') {
  const s = toHan(text);
  // 「補助率」「助成率」の後ろに 1〜2桁の数字＋%
  const m = /(補助率|助成率)[^0-9％%]{0,10}([0-9]{1,2})\s*%/.exec(s);
  if (m) {
    return `${m[2]}%`;
  }
  // 「3分の2」などの表現は必要なら後で追加
  return '';
}

// 上限額（例: 上限 100万円, 最大 50万円）
export function extractAmount(text = '') {
  const s = toHan(text);
  const m = /(上限額?|最大)[^0-9]{0,10}([0-9,]+)\s*(万円|円)/.exec(s);
  if (!m) return '';

  let val = m[2].replace(/,/g, '');
  if (m[3] === '万円') {
    val = String(parseInt(val, 10) * 10000);
  }
  const n = Number(val);
  if (!n) return '';
  return `${n.toLocaleString('ja-JP')}円`;
}

// 対象（ざっくりキーワード）
export function extractTarget(text = '') {
  const s = String(text);
  const m =
    /(中小企業|小規模事業者?|個人事業主|創業|スタートアップ|NPO|農林水産|観光|IT|製造業?|商業)/.exec(
      s
    );
  return m ? m[1] : '';
}
