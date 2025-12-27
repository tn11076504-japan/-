// src/details.js
//
// 詳細ページに飛んで、募集開始 / 締切日 / 補助率 / 上限額 / 対象 を補強する
//

import axios from 'axios';
import * as cheerio from 'cheerio';
import { stripTags, truncate } from './utils.js';
import { extractDateRange, extractRate, extractLimit, extractTarget, extractDeadlineSmart } from './date.js';

/**
 * records: scrapeHtml / scrapeRss が作った案件配列
 * src: ソースシート 1 行分
 */
export async function enrichRecordsWithDetails(records, src, settings, logFn) {
  if (!src.detail) return; // 詳細取得フラグ FALSE の場合は何もしない
  if (!records || records.length === 0) return;

  const maxPerSource = settings.MAX_DETAIL_PER_SOURCE || 80;
  const targets = records.slice(0, maxPerSource);

  let success = 0;
  let deadlineHit = 0;
  let startHit = 0;
  let rateHit = 0;
  let limitHit = 0;
  let targetHit = 0;

  for (const rec of targets) {
    if (!rec.URL) continue;

    try {
      const res = await axios.get(rec.URL, { timeout: 15000 });
      const $ = cheerio.load(res.data);
      // 多少雑でも body 全体から拾う方針
      const bodyText = stripTags($('body').html() || $('body').text() || '')
        .replace(/\r?\n/g, '\n');

      // 募集期間（開始・締切）
      const range = extractDateRange(bodyText, src.startRegex || '');
      if (range.start && !rec.募集開始) {
        rec.募集開始 = range.start;
        startHit++;
      }
      if (range.end && !rec.締切日) {
        rec.締切日 = range.end;
        deadlineHit++;
      }
      // もしどちらも取れていない＆リスト由来の締切も無い場合は、本文全体から保険で締切抽出
      if (!rec.締切日) {
        const dl = extractDeadlineSmart(bodyText, src.deadlineRegex || '', 'SMART');
        if (dl) {
          rec.締切日 = dl;
          deadlineHit++;
        }
      }

      // 補助率
      const rate = extractRate(bodyText, src.rateRegex || '');
      if (rate && !rec.補助率) {
        rec.補助率 = rate;
        rateHit++;
      }

      // 上限額
      const limit = extractLimit(bodyText, src.limitRegex || '');
      if (limit && !rec.上限額) {
        rec.上限額 = limit;
        limitHit++;
      }

      // 対象
      const tgt = extractTarget(bodyText, src.targetRegex || '');
      if (tgt && !rec.対象) {
        rec.対象 = truncate(tgt, 60);
        targetHit++;
      }

      success++;
    } catch (e) {
      if (logFn) {
        await logFn(
          `detail error url=${rec.URL} msg=${e.message || e.toString()}`
        );
      }
    }
  }

  if (logFn) {
    await logFn(
      `detail summary source=${src.name} total=${records.length} fetched=${targets.length} ok=${success} startHit=${startHit} deadlineHit=${deadlineHit} rateHit=${rateHit} limitHit=${limitHit} targetHit=${targetHit}`
    );
  }
}
