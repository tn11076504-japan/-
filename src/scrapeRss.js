// src/scrapeRss.js
// RSS / Atom フィードから案件レコードを生成

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import {
  stripTags,
  canonicalizeUrl,
  truncate,
} from './utils.js';
import { extractDeadlineSmart, todayJst } from './date.js';

export async function scrapeRss(src, settings) {
  const url = String(src['URL'] || '').trim();
  const inRe = new RegExp(String(src['抽出IN'] || settings.FILTER_INCLUDE));
  const outRe = new RegExp(String(src['抽出OUT'] || settings.FILTER_EXCLUDE));
  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  const stats = {
    type: 'rss',
    total: 0,
    inHit: 0,
    out: 0,
    adopted: 0,
    deadlineHit: 0,
  };

  if (!url) {
    return { recs: [], stats };
  }

  const res = await axios.get(url, { timeout: 15000 });
  const xml = res.data;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const feed = parser.parse(xml);

  const items =
    feed?.rss?.channel?.item ||
    feed?.feed?.entry ||
    [];

  const recs = [];

  for (const it of items) {
    stats.total += 1;

    const title = stripTags(it.title || '');
    const link = it.link?.['@_href'] || it.link || it.guid || '';
    const desc = stripTags(it.description || it.content || '');
    const text = `${title} ${desc}`.trim();

    if (!inRe.test(text)) continue;
    stats.inHit += 1;

    if (outRe.test(text)) {
      stats.out += 1;
      continue;
    }

    const deadline = extractDeadlineSmart(text, String(src['締切抽出REGEX'] || ''), mode);
    if (deadline) stats.deadlineHit += 1;

    recs.push({
      県: src['県'] || '',
      タイトル: truncate(title, 160) || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: canonicalizeUrl(link, url),
      出典: src['名称'] || '',
      取得日: todayJst(),
    });
    stats.adopted += 1;
  }

  return { recs, stats };
}
