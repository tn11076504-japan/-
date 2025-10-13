import axios from 'axios';
import cheerio from 'cheerio';
import { stripTags, canonicalizeUrl, shouldSkipHref, truncate } from './utils.js';
import { extractDeadlineSmart } from './date.js';

export async function scrapeHtml(src, settings){
  const baseUrl = String(src['URL']||'').trim();
  const scopePath = String(src['範囲(パス)']||'').trim();
  const inRe  = new RegExp(String(src['抽出IN']||settings.FILTER_INCLUDE));
  const outRe = new RegExp(String(src['抽出OUT']||settings.FILTER_EXCLUDE));
  const mode  = String(settings.DEADLINE_MODE||'LOOSE');

  const res = await axios.get(baseUrl, { timeout: 10000 });
  const $ = cheerio.load(res.data);

  let adopted = 0;
  const recs = [];
  $('a[href]').each((_,a)=>{
    const hrefRaw = $(a).attr('href')||'';
    if (shouldSkipHref(hrefRaw)) return;
    let hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) return;

    // scope
    if (scopePath){
      try{
        const p = new URL(hrefAbs).pathname || '/';
        if (!p.startsWith(scopePath)) return;
      }catch(_){}
    }

    const text = stripTags($(a).text());
    if (!inRe.test(text)) return;
    if (outRe.test(text)) return;

    const deadline = extractDeadlineSmart(text, String(src['締切抽出REGEX']||''), mode);
    recs.push({
      県: src['県']||'',
      タイトル: truncate(text,160) || '(無題)',
      公募主体: src['主体(固定)']||'',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: hrefAbs,
      出典: src['名称']||'',
      取得日: todayStr()
    });
    adopted++;
  });
  return recs;
}

function todayStr(){
  const jst = new Date();
  const tzOffset = 9*60; // JST
  const utc = new Date(jst.getTime() + (jst.getTimezoneOffset()+tzOffset)*60000);
  return utc.toISOString().slice(0,10);
}
