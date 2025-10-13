import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { stripTags, canonicalizeUrl } from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeRss(src, settings){
  const url = String(src['URL']||'').trim();
  const inRe  = new RegExp(String(src['抽出IN']||settings.FILTER_INCLUDE));
  const outRe = new RegExp(String(src['抽出OUT']||settings.FILTER_EXCLUDE));
  const mode  = String(settings.DEADLINE_MODE||'LOOSE');

  const res = await axios.get(url, { timeout: 10000 });
  const parser = new XMLParser({ ignoreAttributes:false });
  const json = parser.parse(res.data);

  const items = []
    .concat(json?.rss?.channel?.item || [])
    .concat(json?.feed?.entry || []);

  const recs = [];
  for (const it of items){
    const title = it.title?.['#text'] || it.title || '';
    const link  = it.link?.['@_href'] || it.link || it.guid || '';
    const desc  = stripTags(it.description || it.content || '');
    const text  = `${title} ${desc}`;
    if (!inRe.test(text)) continue;
    if (outRe.test(text)) continue;

    const deadline = extractDeadlineSmart(text, String(src['締切抽出REGEX']||''), mode);
    recs.push({
      県: src['県']||'',
      タイトル: title || '(無題)',
      公募主体: src['主体(固定)']||'',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: canonicalizeUrl(link, url),
      出典: src['名称']||'',
      取得日: todayStr()
    });
  }
  return recs;
}

function todayStr(){
  const jst = new Date();
  const tzOffset = 9*60;
  const utc = new Date(jst.getTime() + (jst.getTimezoneOffset()+tzOffset)*60000);
  return utc.toISOString().slice(0,10);
}
