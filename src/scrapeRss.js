// src/scrapeRss.js
//
// RSS / Atom フィードから案件候補を拾う
//

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { stripTags, canonicalizeUrl, truncate, todayJstDate } from './utils.js';
import { extractDeadlineSmart } from './date.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

export async function scrapeRss(src, settings, logger) {
  const url = String(src.url || '').trim();
  const inRe = new RegExp(String(src.includeIn || settings.FILTER_INCLUDE), 'u');
  const outRe = new RegExp(String(src.includeOut || settings.FILTER_EXCLUDE), 'u');
  const mode = String(settings.DEADLINE_MODE || 'SMART');

  const res = await axios.get(url, { timeout: 15000 });
  const xml = parser.parse(res.data);

  const items = getItems(xml);
  const recs = [];

  for (const it of items) {
    const title = it.title || '';
    const desc = stripTags(it.description || it.content || '');
    const link = it.link?.['@_href'] || it.link || it.guid || '';
    const text = `${title} ${desc}`;

    if (!inRe.test(text)) continue;
    if (outRe.test(text)) continue;

    const deadline = extractDeadlineSmart(
      text,
      src.deadlineRegex || '',
      mode
    );

    recs.push({
      県: src.pref || '',
      タイトル: truncate(title || desc, 160) || '(無題)',
      公募主体: src.fixedOrg || '',
      募集開始: '',
      締切日: deadline || '',
      補助率: '',
      上限額: '',
      対象: '',
      URL: canonicalizeUrl(link, url),
      出典: src.name || '',
      取得日: todayJstDate()
    });
  }

  if (logger) {
    await logger(
      `source=${src.name} type=rss items=${items.length} recs=${recs.length}`
    );
  }

  return recs;
}

function getItems(xmlRoot) {
  if (!xmlRoot) return [];
  if (xmlRoot.rss?.channel?.item) return arr(xmlRoot.rss.channel.item);
  if (xmlRoot.feed?.entry) return arr(xmlRoot.feed.entry);
  return [];
}

function arr(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
