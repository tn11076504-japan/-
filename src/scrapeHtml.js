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

export async function scrapeHtml(src, settings) {
  const baseUrl = String(src['URL'] || '').trim();
  const scopePath = String(src['範囲(パス)'] || '').trim();
  const inRe = new RegExp(
    String(src['抽出IN'] || settings.FILTER_INCLUDE || ''),
    'i'
  );
  const outRe = new RegExp(
    String(src['抽出OUT'] || settings.FILTER_EXCLUDE || ''),
    'i'
  );
  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  if (!baseUrl) return [];

  const res = await axios.get(baseUrl, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const recs = [];
  $('a[href]').each((_, a) => {
    const hrefRaw = $(a).attr('href') || '';
    if (shouldSkipHref(hrefRaw)) return;

    let hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) return;

    // scopePath があればその配下だけ
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

    if (!inRe.test(text)) return;
    if (outRe.test(text)) return;

    const deadline = extractDeadlineSmart(
      text,
      String(src['締切抽出REGEX'] || ''),
      mode
    );

    recs.push({
      県: src['県'] || '',
      タイトル: text || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: hrefAbs,
      出典: src['名称'] || '',
      取得日: todayJst()
    });
  });

  return recs;
}
