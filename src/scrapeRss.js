// src/scrapeRss.js
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import {
  stripTags,
  canonicalizeUrl,
  todayJst
} from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeRss(src, settings) {
  const url = String(src['URL'] || '').trim();
  if (!url) return [];

  const inRe = new RegExp(
    String(src['抽出IN'] || settings.FILTER_INCLUDE || ''),
    'i'
  );
  const outRe = new RegExp(
    String(src['抽出OUT'] || settings.FILTER_EXCLUDE || ''),
    'i'
  );
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
    const desc = stripTags(it.description || it.summary || '');
    const text = `${title} ${desc}`.trim();

    if (!title) continue;
    if (!inRe.test(text)) continue;
    if (outRe.test(text)) continue;

    const hrefAbs = canonicalizeUrl(linkRaw, url);
    if (!hrefAbs) continue;

    const deadline = extractDeadlineSmart(
      text,
      String(src['締切抽出REGEX'] || ''),
      mode
    );

    recs.push({
      県: src['県'] || '',
      タイトル: title || '(無題)',
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
  }

  return recs;
}
