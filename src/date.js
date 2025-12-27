// src/date.js
//
// 日付関係のユーティリティ
//

/**
 * テキスト中の「令和/平成 or 西暦」の日付をすべて ISO (YYYY-MM-DD) で返す
 */
export function parseJapaneseDates(text = '') {
  const t = String(text);
  const results = [];

  // 1) 元号表記
  const eraRe = /(令和|平成)\s*([0-9]{1,2})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日/g;
  let m;
  while ((m = eraRe.exec(t)) !== null) {
    const era = m[1];
    const nen = Number(m[2]);
    const month = Number(m[3]);
    const day = Number(m[4]);
    if (!nen || !month || !day) continue;
    let year;
    if (era === '令和') {
      year = 2018 + nen; // R1=2019
    } else {
      year = 1988 + nen; // H1=1989
    }
    results.push(toIsoDate(year, month, day));
  }

  // 2) 西暦表記
  const seirekiRe = /([0-9]{4})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日/g;
  while ((m = seirekiRe.exec(t)) !== null) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!year || !month || !day) continue;
    results.push(toIsoDate(year, month, day));
  }

  return results;
}

/**
 * リストや本文から締切日っぽい日付を 1 つ返す
 * - overrideRegex があれば、そのマッチ部分から抽出
 * - なければテキスト中の最後の日付を締切扱い
 */
export function extractDeadlineSmart(text = '', overrideRegex = '', mode = 'SMART') {
  const baseText = String(text || '');

  let dates = [];
  if (overrideRegex) {
    try {
      const re = new RegExp(overrideRegex, 'u');
      const m = baseText.match(re);
      if (m) {
        dates = parseJapaneseDates(m[0]);
      }
    } catch (e) {
      // REGEX が壊れていても死なないように
    }
  }

  if (dates.length === 0) {
    dates = parseJapaneseDates(baseText);
  }

  if (dates.length === 0) return '';
  // 一番後ろの日付を締切とみなす
  return dates[dates.length - 1];
}

/**
 * テキストから「期間」を抽出して { start, end } を返す
 * - まず overrideRegex があればその範囲から
 * - なければ '募集期間','申請期間','受付期間' を含む行から
 * - 最終的に、見つかった日付列の先頭と末尾を period とみなす
 */
export function extractDateRange(text = '', overrideRegex = '') {
  const t = String(text || '');

  let target = '';
  if (overrideRegex) {
    try {
      const re = new RegExp(overrideRegex, 'u');
      const m = t.match(re);
      if (m) target = m[0];
    } catch (e) {
      // 無視
    }
  }

  if (!target) {
    const lines = t.split(/\r?\n/);
    const hit = lines.find(line =>
      /募集期間|募集期間等|申請期間|受付期間|受付期間等/.test(line)
    );
    target = hit || t;
  }

  const dates = parseJapaneseDates(target);
  if (dates.length >= 2) {
    return { start: dates[0], end: dates[dates.length - 1] };
  } else if (dates.length === 1) {
    return { start: '', end: dates[0] };
  }
  return { start: '', end: '' };
}

/**
 * 補助率を抽出（「補助率: 2/3」や「補助率 10/10」「1/2以内」など）→ そのまま文字列で返す
 */
export function extractRate(text = '', overrideRegex = '') {
  const t = String(text || '');
  let target = '';

  if (overrideRegex) {
    try {
      const re = new RegExp(overrideRegex, 'u');
      const m = t.match(re);
      if (m) target = m[0];
    } catch (e) {}
  }

  if (!target) {
    const lines = t.split(/\r?\n/);
    const hit = lines.find(line => /補助率|助成率/.test(line));
    target = hit || '';
  }

  if (!target) return '';

  // 例: "補助率 2/3以内" / "補助率 10/10" / "1/2"
  const frac = target.match(/([0-9]+\/[0-9]+)\s*([以内まで]?)/);
  if (frac) {
    return frac[1] + (frac[2] || '');
  }

  // 例: "補助率 3分の2"
  const bunno = target.match(/([0-9一二三四五六七八九]+)分の([0-9一二三四五六七八九]+)/);
  if (bunno) {
    return bunno[1] + '分の' + bunno[2];
  }

  // 例: "補助率 3/4、ただし上限◯◯円"
  const percent = target.match(/([0-9]{1,3})\s*[%％]/);
  if (percent) {
    return percent[1] + '%';
  }

  if (/定額|全額/.test(target)) return '定額';

  return '';
}

/**
 * 上限額っぽい金額（◯円）を抽出
 */
export function extractLimit(text = '', overrideRegex = '') {
  const t = String(text || '');
  let target = '';

  if (overrideRegex) {
    try {
      const re = new RegExp(overrideRegex, 'u');
      const m = t.match(re);
      if (m) target = m[0];
    } catch (e) {}
  }

  if (!target) {
    const lines = t.split(/\r?\n/);
    const hit = lines.find(line =>
      /上限|上限額|補助上限|補助金額|限度額/.test(line)
    );
    target = hit || '';
  }

  if (!target) return '';

  const m = target.match(/([0-9０-９,]+)\s*円/);
  if (!m) return '';
  const raw = m[1].replace(/[０-９]/g, d => String('０１２３４５６７８９'.indexOf(d)));
  const num = raw.replace(/,/g, '');
  return num ? `${Number(num).toLocaleString('ja-JP')}円` : '';
}

/**
 * 対象者・対象事業の概要をざっくり抜く
 * 文章そのままでは長いので、先頭 40 〜 60 文字だけ
 */
export function extractTarget(text = '', overrideRegex = '') {
  const t = String(text || '');
  let target = '';

  if (overrideRegex) {
    try {
      const re = new RegExp(overrideRegex, 'u');
      const m = t.match(re);
      if (m) target = m[0];
    } catch (e) {}
  }

  if (!target) {
    const lines = t.split(/\r?\n/);
    const hit = lines.find(line =>
      /対象者|対象事業|補助対象|支援対象|対象となる/.test(line)
    );
    target = hit || '';
  }

  if (!target) return '';

  const idx = target.search(/対象者|対象事業|補助対象|支援対象|対象となる/);
  const s = idx >= 0 ? target.slice(idx) : target;
  return s.replace(/\s+/g, ' ').slice(0, 60);
}

// 内部ユーティリティ
function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, '0');
  const d = String(Number(day)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
