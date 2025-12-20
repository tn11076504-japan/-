// src/scrapeRss.js
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import {
  stripTags,
  canonicalizeUrl,
  todayJst
} from './utils.js';
import { extractDeadlineSmart } from './date.js';
import { extractRate, extractAmount, extractTarget } from './detail.js';

export async function scrapeRss(src, settings) {
  const url = String(src['URL'] || '').trim();
  if (!url) return [];

  const inPattern = String(
    src['抽出IN'] || settings.FILTER_INCLUDE || ''
  );
  const outPattern = String(
    src['抽出OUT'] || settings.FILTER_EXCLUDE || ''
  );

  const inRe = inPattern ? new RegExp(inPattern, 'i') : null;
  const outRe = outPattern ? new RegExp(outPattern, 'i') : null;

  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  const res = await axios.get(url, { timeout: 15000 });
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(res.data);

  const channel = doc.rss?.channel || doc.feed;
  if (!channel) return [];

  const items = channel.item || channel.entry || [];
  const list = Array.isArray(items) ? items : [items];

  const recs = [];

  for (const it of list) {
    const title = stripTags(it.title || '');
    const linkRaw =
      it.link?.['@_href'] || it.link || it.guid || '';
    const desc = stripTags(
      it.description || it.summary || it.content || ''
    );
    const text = `${title} ${desc}`.trim();

    if (!title) continue;
    if (inRe && !inRe.test(text)) continue;
    if (outRe && outRe.test(text)) continue;

    const hrefAbs = canonicalizeUrl(linkRaw, url);
    if (!hrefAbs) continue;

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
      タイトル: title || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: rate,
      上限額: amount,
      対象: target,
      URL: hrefAbs,
      出典: src['名称'] || '',
      取得日: todayJst()
    });
  }

  return recs;
}
