import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  canonicalizeUrl,
  shouldSkipHref,
  normalizeSpace,
  todayJst,
} from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeHtml(src) {
  const baseUrl = String(src['URL'] || '').trim();
  const scopePath = String(src['範囲(パス)'] || '').trim();
  const inPattern = String(src['抽出IN'] || '').trim();
  const outPattern = String(src['抽出OUT'] || '').trim();
  const includeRe = inPattern ? new RegExp(inPattern) : null;
  const excludeRe = outPattern ? new RegExp(outPattern) : null;

  const res = await axios.get(baseUrl, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const seenUrls = new Set();
  const records = [];

  $('a[href]').each((_, a) => {
    const hrefRaw = $(a).attr('href') || '';
    if (shouldSkipHref(hrefRaw)) return;
    const hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) return;
    if (seenUrls.has(hrefAbs)) return;
    seenUrls.add(hrefAbs);

    if (scopePath) {
      try {
        const p = new URL(hrefAbs).pathname || '/';
        if (!p.startsWith(scopePath)) return;
      } catch {
        // ignore URL parse error
      }
    }

    const text = normalizeSpace($(a).text());
    if (!text) return;

    if (includeRe && !includeRe.test(text)) return;
    if (excludeRe && excludeRe.test(text)) return;

    const deadline = extractDeadlineSmart(
      text,
      String(src['締切抽出REGEX'] || '').trim(),
    );

    records.push({
      県: src['県'] || '',
      タイトル: text || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: hrefAbs,
      取得日: todayJst(),
    });
  });

  return records;
}
