// src/scrapeHtml.js
//
// HTML リストページを見て、リンクから案件候補を拾う
//

import axios from 'axios';
import * as cheerio from 'cheerio';
import { stripTags, canonicalizeUrl, shouldSkipHref, truncate, todayJstDate } from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeHtml(src, settings, logger) {
  const baseUrl = String(src.url || '').trim();
  const scopePath = String(src.scopePath || '').trim();
  const inRe = new RegExp(String(src.includeIn || settings.FILTER_INCLUDE), 'u');
  const outRe = new RegExp(String(src.includeOut || settings.FILTER_EXCLUDE), 'u');
  const mode = String(settings.DEADLINE_MODE || 'SMART');

  const res = await axios.get(baseUrl, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const recs = [];
  let total = 0;
  let adopted = 0;

  $('a[href]').each((_, a) => {
    total++;
    const hrefRaw = $(a).attr('href') || '';
    if (shouldSkipHref(hrefRaw)) return;
    const hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) return;

    // scopePath がある場合はその配下だけ
    if (scopePath) {
      try {
        const p = new URL(hrefAbs).pathname || '/';
        if (!p.startsWith(scopePath)) return;
      } catch (_) {}
    }

    const text = stripTags($(a).text());
    if (!text) return;
    if (!inRe.test(text)) return;
    if (outRe.test(text)) return;

    const deadline = extractDeadlineSmart(
      text,
      src.deadlineRegex || '',
      mode
    );

    recs.push({
      県: src.pref || '',
      タイトル: truncate(text, 160) || '(無題)',
      公募主体: src.fixedOrg || '',
      募集開始: '',
      締切日: deadline || '',
      補助率: '',
      上限額: '',
      対象: '',
      URL: hrefAbs,
      出典: src.name || '',
      取得日: todayJstDate()
    });

    adopted++;
  });

  if (logger) {
    await logger(
      `source=${src.name} type=html total=${total} recs=${recs.length} adopted=${adopted}`
    );
  }

  return recs;
}
