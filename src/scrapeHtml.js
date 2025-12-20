// src/scrapeHtml.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  stripTags,
  canonicalizeUrl,
  shouldSkipHref,
  todayJst
} from './utils.js';
import { extractDeadlineSmart } from './date.js';
import { extractRate, extractAmount, extractTarget } from './detail.js';

export async function scrapeHtml(src, settings) {
  const baseUrl = String(src['URL'] || '').trim();
  const scopePath = String(src['範囲(パス)'] || '').trim();

  const inPattern = String(
    src['抽出IN'] || settings.FILTER_INCLUDE || ''
  );
  const outPattern = String(
    src['抽出OUT'] || settings.FILTER_EXCLUDE || ''
  );

  const inRe = inPattern ? new RegExp(inPattern, 'i') : null;
  const outRe = outPattern ? new RegExp(outPattern, 'i') : null;

  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  if (!baseUrl) return [];

  const res = await axios.get(baseUrl, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const recs = [];

  $('a[href]').each((_, a) => {
    const hrefRaw = $(a).attr('href') || '';
    if (shouldSkipHref(hrefRaw)) return;

    const hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) return;

    if (scopePath) {
      try {
        const p = new URL(hrefAbs).pathname || '/';
        if (!p.startsWith(scopePath)) return;
      } catch {
        return;
      }
    }

    const text = stripTags($(a).text());
    if (!text) return;

    if (inRe && !inRe.test(text)) return;
    if (outRe && outRe.test(text)) return;

    const deadline = extractDeadlineSmart(
      text,
      String(src['締切抽出REGEX'] || ''),
      mode
    );

    const rate = extractRate(text);
    const amount = extractAmount(text);
    const target = extractTarget(text);

    recs.push({
      県: src['県'] || '',
      タイトル: text || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',           // 一覧ページではまだ空
      締切日: deadline,
      補助率: rate,
      上限額: amount,
      対象: target,
      URL: hrefAbs,
      出典: src['名称'] || '',
      取得日: todayJst()
    });
  });

  return recs;
}
