import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import {
  normalizeSpace,
  canonicalizeUrl,
  todayJst,
} from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeRss(src) {
  const url = String(src['URL'] || '').trim();
  const inPattern = String(src['抽出IN'] || '').trim();
  const outPattern = String(src['抽出OUT'] || '').trim();
  const includeRe = inPattern ? new RegExp(inPattern) : null;
  const excludeRe = outPattern ? new RegExp(outPattern) : null;

  const res = await axios.get(url, { timeout: 15000 });
  const parser = new XMLParser({ ignoreAttributes: false });
  const feed = parser.parse(res.data);

  const items =
    feed.rss?.channel?.item ||
    feed.feed?.entry ||
    [];

  const records = [];

  for (const item of items) {
    const title = normalizeSpace(item.title?.['#text'] || item.title || '');
    const desc = normalizeSpace(
      item.description ||
        item['content:encoded'] ||
        item.summary ||
        '',
    );
    const text = `${title} ${desc}`.trim();

    if (!text) continue;
    if (includeRe && !includeRe.test(text)) continue;
    if (excludeRe && excludeRe.test(text)) continue;

    const linkVal =
      item.link?.['@_href'] ||
      item.link?.['#text'] ||
      item.link ||
      item.guid ||
      '';
    const link = canonicalizeUrl(String(linkVal), url);

    const deadline = extractDeadlineSmart(
      text,
      String(src['締切抽出REGEX'] || '').trim(),
    );

    records.push({
      県: src['県'] || '',
      タイトル: title || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: link,
      取得日: todayJst(),
    });
  }

  return records;
}
