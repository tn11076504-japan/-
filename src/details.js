// src/details.js
// 補助金・公募の「詳細ページ」から募集開始・締切日・補助率・上限額・対象などを
// できる限り汎用的に拾って、案件DBのレコードを上書き強化するモジュール。

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * メインエントリ
 * @param {Array<Object>} records scrapeHtml / scrapeRss で作った案件DB用レコード
 * @param {Object} src      ソース行（ソースシート1行分）
 * @param {Object} settings 設定（未使用でも受け取る）
 * @param {Function} log    ロガー関数 log(level, message)
 * @returns {Promise<Array<Object>>}
 */
export async function enrichRecordsWithDetails(records, src, settings, log) {
  const sourceName = String(src['名称'] || '');
  const enabled = String(src['詳細取得'] || '').toUpperCase() === 'TRUE';

  // 詳細取得フラグが FALSE なら何もしない
  if (!enabled) {
    if (log) log('INFO', `detail summary source=${sourceName} total=${records.length} skipped(detailFetchDisabled)`);
    return records;
  }

  const updated = [];
  let fetched = 0;
  let startHit = 0;
  let deadlineHit = 0;
  let rateHit = 0;
  let limitHit = 0;
  let targetHit = 0;

  for (const rec of records) {
    const url = String(rec.URL || rec.Url || '').trim();
    if (!url) {
      updated.push(rec);
      continue;
    }

    let htmlText = '';
    try {
      const res = await axios.get(url, { timeout: 15000 });
      fetched++;
      const $ = cheerio.load(res.data);

      // 汎用的に「本文らしき箇所」をなるべく狭く取る
      const main =
        $('article').first().text() ||
        $('.post').first().text() ||
        $('.entry').first().text() ||
        $('#contents').first().text() ||
        $('#content').first().text() ||
        $('#main').first().text() ||
        $('body').text();

      htmlText = (main || '').replace(/\s+/g, ' ').trim();
    } catch (e) {
      if (log) {
        log(
          'WARN',
          `detail fetch error source=${sourceName} url=${url} ${e && e.message ? e.message : e}`
        );
      }
      updated.push(rec);
      continue;
    }

    if (!htmlText) {
      updated.push(rec);
      continue;
    }

    const detail = extractDetailFields(htmlText);

    // ====== 抽出結果をレコードにマージ ======
    // すでに値が入っている場合は「既存優先」で、空欄のときだけ上書きします。
    if (detail.startDate && !rec.募集開始) {
      rec.募集開始 = detail.startDate;
      startHit++;
    }
    if (detail.deadline && !rec.締切日) {
      rec.締切日 = detail.deadline;
      deadlineHit++;
    }
    if (detail.rate && !rec.補助率) {
      rec.補助率 = detail.rate;
      rateHit++;
    }
    if (detail.limit && !rec.上限額) {
      rec.上限額 = detail.limit;
      limitHit++;
    }
    if (detail.target && !rec.対象) {
      rec.対象 = detail.target;
      targetHit++;
    }

    updated.push(rec);
  }

  if (log) {
    log(
      'INFO',
      `detail summary source=${sourceName} total=${records.length} fetched=${fetched}` +
        ` startHit=${startHit} deadlineHit=${deadlineHit} rateHit=${rateHit}` +
        ` limitHit=${limitHit} targetHit=${targetHit}`
    );
  }

  return updated;
}

/**
 * 1ページ分の本文テキストから、募集開始・締切・補助率・上限額・対象をざっくり抽出
 * 汎用ロジックなので、個別サイトごとのチューニングはここに追加していく。
 */
function extractDetailFields(text) {
  const result = {
    startDate: '',
    deadline: '',
    rate: '',
    limit: '',
    target: '',
  };

  const normalized = text.replace(/\s+/g, ' ');

  // ========== 対象 ==========
  // 「中小企業」が出てきたら、とりあえず対象は中小企業とみなす（今の要件に合わせて）
  if (/中小企業/.test(normalized)) {
    result.target = '中小企業';
  }

  // 「対象者」「対象企業」などの行を一文だけ抜く
  const targetMatch = normalized.match(/(対象者|対象企業|対象となる方|対象[：:])[：:]?([^。]+)[。]/);
  if (targetMatch && targetMatch[2]) {
    const t = targetMatch[2].trim();
    if (t && (!result.target || t.length < result.target.length + 5)) {
      result.target = t;
    }
  }

  // ========== 補助率 ==========
  const rateMatch = normalized.match(/(補助率[：:は]?[^。]+)/);
  if (rateMatch) {
    result.rate = rateMatch[1].trim();
  } else {
    // 「助成率」「負担割合」等も一応カバー
    const rateAlt = normalized.match(/(助成率|負担割合)[：:は]?[^。]+/);
    if (rateAlt) {
      result.rate = rateAlt[0].trim();
    }
  }

  // ========== 上限額 ==========
  const limitMatch = normalized.match(/(補助上限額|補助上限|上限額|上限|限度額)[：:は]?[^。]+/);
  if (limitMatch) {
    result.limit = limitMatch[0].trim();
  }

  // ========== 募集開始 & 締切 ==========
  // 「募集期間」「受付期間」「申請期間」「公募期間」などの行を対象にして
  // その中から日付を 2個取れたら [開始, 締切] とみなす。
  const periodMatch = normalized.match(
    /(募集期間|受付期間|申請期間|公募期間|申込期間|募集受付期間)[^。]{0,80}。/
  );
  if (periodMatch) {
    const periodText = periodMatch[0];
    const dates = extractAllDates(periodText);
    if (dates.length >= 2) {
      result.startDate = dates[0];
      result.deadline = dates[1];
    } else if (dates.length === 1) {
      // 1つしか取れない場合、締切だけ分かるパターンが多いので締切に入れておく
      result.deadline = dates[0];
    }
  }

  // それでも締切が空なら、全体から「〜まで」の近くの1日付を締切として拾う
  if (!result.deadline) {
    const untilMatch = normalized.match(/([0-9０-９令和平成昭和].{0,30}まで)/);
    if (untilMatch) {
      const dates = extractAllDates(untilMatch[1]);
      if (dates.length >= 1) {
        result.deadline = dates[dates.length - 1];
      }
    }
  }

  return result;
}

/**
 * テキスト中から「西暦 or 元号付きの日付」を全部抜き出して ISO 形式(YYYY-MM-DD)にする
 */
function extractAllDates(text) {
  const dates = [];

  // 西暦パターン 2025年12月28日 / 2025/12/28 など
  const westernRe = /(20\d{2})[年\/.-]\s*(\d{1,2})[月\/.-]\s*(\d{1,2})日?/g;
  let m;
  while ((m = westernRe.exec(text)) !== null) {
    const iso = toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) dates.push(iso);
  }

  // 元号（令和 / 平成 / 昭和）パターン
  const eraRe = /(令和|平成|昭和)\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日?/g;
  while ((m = eraRe.exec(text)) !== null) {
    const year = eraToAD(m[1], Number(m[2]));
    const iso = toIsoDate(year, Number(m[3]), Number(m[4]));
    if (iso) dates.push(iso);
  }

  // 「R7.2.28」みたいな略記も一応拾っておく
  const shortEraRe = /R(\d{1,2})\.(\d{1,2})\.(\d{1,2})/gi;
  while ((m = shortEraRe.exec(text)) !== null) {
    const year = 2018 + Number(m[1]); // R1=2019
    const iso = toIsoDate(year, Number(m[2]), Number(m[3]));
    if (iso) dates.push(iso);
  }

  return dates;
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day) return '';
  try {
    // JS の Date は月が 0 始まりなので -1 する
    const d = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function eraToAD(era, n) {
  // ざっくり変換（日本の補助金サイトで使う範囲ならこれで十分）
  if (era === '令和') {
    return 2018 + n; // R1=2019
  }
  if (era === '平成') {
    return 1988 + n; // H1=1989
  }
  if (era === '昭和') {
    return 1925 + n; // S1=1926
  }
  return 2000 + n; // fallback
}
