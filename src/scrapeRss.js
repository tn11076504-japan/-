// src/scrapeRss.js
// RSS / Atom フィードから補助金っぽいエントリを拾うスクレイパー

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

import { stripTags, canonicalizeUrl, truncate } from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeRss(src, settings) {
  const url = String(src['URL'] || '').trim();
  if (!url) return [];

  const includePattern = String(
    src['抽出IN'] || settings.FILTER_INCLUDE || ''
  ).trim();
  const excludePattern = String(
    src['抽出OUT'] || settings.FILTER_EXCLUDE || ''
  ).trim();
  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  let includeRe = null;
  let excludeRe = null;

  try {
    if (includePattern) includeRe = new RegExp(includePattern);
  } catch (e) {
    console.error('RSS include 正規表現エラー:', includePattern, e.message);
  }

  try {
    if (excludePattern) excludeRe = new RegExp(excludePattern);
  } catch (e) {
    console.error('RSS exclude 正規表現エラー:', excludePattern, e.message);
  }

  const res = await axios.get(url, {
    timeout: 15000,
    responseType: 'text',
  });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const data = parser.parse(res.data);

  // rss2.0 / atom の両方をざっくりカバー
  const items =
    data?.rss?.channel?.item ||
    data?.feed?.entry ||
    [];

  const recs = [];

  for (const it of items) {
    const title =
      stripTags(it.title?.['#text'] ?? it.title ?? '') || '(無題)';

    const link =
      it.link?.['@_href'] ||
      it.link ||
      it.guid ||
      '';

    const desc = stripTags(it.description || it.content || '');
    const text = `${title} ${desc}`;

    if (includeRe && !includeRe.test(text)) continue;
    if (excludeRe && excludeRe.test(text)) continue;

    const deadline = extractDeadlineSmart(
      text,
      String(src['締切抽出REGEX'] || ''),
      mode
    );

    recs.push({
      県: src['県'] || '',
      タイトル: truncate(title, 160),
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: canonicalizeUrl(String(link || ''), url),
      出典: src['名称'] || '',
      取得日: todayStr(),
    });
  }

  return recs;
}

function todayStr() {
  const now = new Date();
  const tzOffsetMinutes = 9 * 60; // JST (UTC+9)
  const jst = new Date(
    now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset()) * 60000
  );
  return jst.toISOString().slice(0, 10);
}
