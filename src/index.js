import axios from 'axios';
import pdf from 'pdf-parse';
import { readAll, readRange, writeRange, appendLog } from './sheets.js';
import { scrapeHtml } from './scrapeHtml.js';
import { scrapeRss } from './scrapeRss.js';
import { canonicalizeUrl, stripTags, hostOf } from './utils.js';
import { detectClosed, extractDeadlineSmart, extractStartDate, normalizeDate } from './date.js';

const SH = { settings:'設定', sources:'ソース', db:'案件DB', log:'ログ' };
const DEFAULTS = {
  FILTER_INCLUDE: '補助金|助成金|交付金|補助事業|支援金|支援制度|給付金|公募|募集|助成',
  FILTER_EXCLUDE: 'セミナー|説明会|相談会|講座|イベント|展示会|見学|ワークショップ|募集終了|終了しました|受付終了|受け付け終了|お知らせ|告知|採用|求人|職員募集|採択|交付決定|審査結果|結果発表|落選|公示|公告|入札|プロポーザル|表彰|認定|ガイドライン|要綱|要領|様式|申請書|請求書|取下|報告書|FAQ|更新しました|掲載しました|検索|実績報告|実績申請|実績の提出',
  DEADLINE_MODE: 'LOOSE',
  EXCLUDE_PAST: 'TRUE'
};

async function readSettings(){
  const rows = await readRange(SH.settings);
  const map = Object.fromEntries((rows||[]).map(r=>[r[0], r[1]]));
  return {
    FILTER_INCLUDE: map['FILTER_INCLUDE'] || DEFAULTS.FILTER_INCLUDE,
    FILTER_EXCLUDE: map['FILTER_EXCLUDE'] || DEFAULTS.FILTER_EXCLUDE,
    DEADLINE_MODE:  map['DEADLINE_MODE']  || DEFAULTS.DEADLINE_MODE,
    EXCLUDE_PAST:   map['EXCLUDE_PAST']   || DEFAULTS.EXCLUDE_PAST
  };
}

function keyOf(rec){
  let host = '';
  try{ host = (rec.URL||'').replace(/^https?:\/\//,'').split('/')[0]; }catch(_){}
  return `${(rec.タイトル||'').trim()}|${(rec.締切日||'').trim()}|${host}`;
}

function toScore(rec){
  let s=0;
  const today = new Date(new Date().toISOString().slice(0,10));
  if (rec['締切日']){
    const d = new Date(rec['締切日']);
    if (!isNaN(d)) {
      const diff = Math.ceil((d - today)/(1000*60*60*24));
      if (diff <= 7) s += 30; else if (diff <= 14) s += 20; else if (diff <= 30) s += 10;
      if (diff < 0) s -= 20;
    }
  }
  if (rec['上限額']){
    const n = Number(String(rec['上限額']).replace(/[^0-9]/g,''))||0;
    if (n >= 3000000) s += 30; else if (n >= 1000000) s += 20; else if (n >= 500000) s += 10;
  }
  if (/(中小|小規模|個人事業主|創業)/.test(rec['対象']||'')) s += 10;
  return Math.max(0, Math.min(100,s));
}

async function enrichDetail(rec){
  // 本文を1ページだけ確認（PDFにも対応）
  try{
    if (!rec.URL || !/^https?:\/\//i.test(rec.URL)) return rec;
    const head = await axios.head(rec.URL, { timeout: 10000 }).catch(()=>null);
    let ctype = head?.headers?.['content-type'] || '';
    if (/pdf/i.test(ctype)){
      const buf = await axios.get(rec.URL, { responseType: 'arraybuffer', timeout: 15000 }).then(r=>r.data);
      const text = await pdf(buf).then(d=>d.text).catch(()=> '');
      return applyExtraction(rec, stripTags(text));
    } else {
      const html = await axios.get(rec.URL, { timeout: 15000 }).then(r=>r.data);
      return applyExtraction(rec, stripTags(html));
    }
  }catch(e){
    return rec;
  }
}

function applyExtraction(rec, text){
  const mode='LOOSE';
  const start = extractStartDate(text, mode) || rec['募集開始'] || '';
  let deadline = extractDeadlineSmart(text, '', mode) || rec['締切日'] || '';
  if (detectClosed(text) && !deadline){
    const d = new Date(); d.setDate(d.getDate()-1);
    deadline = d.toISOString().slice(0,10);
  }
  return {
    ...rec,
    募集開始: start || '（不明）',
    締切日: deadline || '（不明）'
  };
}

async function upsertIntoDb(newRecs){
  if (!newRecs.length) return 0;
  const rows = await readRange(SH.db);
  if (!rows || rows.length===0){
    // ヘッダーがない場合は作られている前提なので省略
    return 0;
  }
  const head = rows[0];
  const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  const body = rows.slice(1);
  const byKey = new Map();
  body.forEach(r => {
    const key = String(r[idx['重複キー']]||'');
    if (key) byKey.set(key, r);
  });

  const out = [...rows]; // 既存コピー
  let added=0;
  for (const rec0 of newRecs){
    const rec = { ...rec0 };
    rec['取得日'] = new Date().toISOString().slice(0,10);
    rec['URL'] = canonicalizeUrl(rec['URL'], rec['出典ベース']||'');
    rec['重複キー'] = keyOf(rec);
    rec['スコア'] = toScore(rec);
    rec['新規/更新'] = '新規';

    const exist = byKey.get(rec['重複キー']);
    if (exist){
      // 上書き
      exist[idx['取得日']] = rec['取得日'];
      exist[idx['県']]      = rec['県']      || exist[idx['県']];
      exist[idx['タイトル']] = rec['タイトル'] || exist[idx['タイトル']];
      exist[idx['公募主体']] = rec['公募主体'] || exist[idx['公募主体']];
      exist[idx['募集開始']] = rec['募集開始'] || exist[idx['募集開始']];
      exist[idx['締切日']]   = rec['締切日']   || exist[idx['締切日']];
      exist[idx['補助率']]   = rec['補助率']   || exist[idx['補助率']];
      exist[idx['上限額']]   = rec['上限額']   || exist[idx['上限額']];
      exist[idx['対象']]     = rec['対象']     || exist[idx['対象']];
      exist[idx['URL']]      = rec['URL']      || exist[idx['URL']];
      exist[idx['出典']]     = rec['出典']     || exist[idx['出典']];
      exist[idx['備考']]     = rec['備考']     || exist[idx['備考']];
      exist[idx['スコア']]    = rec['スコア'];
      exist[idx['新規/更新']] = '更新';
    } else {
      const row = head.map(h => rec[h] ?? '');
      out.push(row);
      added++;
    }
  }
  await writeRange(SH.db, out);
  return added;
}

async function main(){
  const settings = await readSettings();
  const sources = (await readAll(SH.sources)).filter(s => /true/i.test(String(s['有効']||'')));
  if (!sources.length){
    await appendLog('WARN','ソース未設定（有効=TRUE が0）');
    return;
  }

  let all = [];
  for (const s of sources){
    try{
      const type = String(s['タイプ']||'').toLowerCase();
      let recs = [];
      if (type==='html')      recs = await scrapeHtml(s, settings);
      else if (type==='rss')  recs = await scrapeRss(s, settings);
      else { await appendLog('WARN',`未対応タイプ: ${s['タイプ']}`); continue; }

      // 軽いディテール補強（1跳ね）
      const enriched = [];
      for (const r of recs){
        // host for key
        const fixed = { ...r };
        // enrich
        enriched.push(await enrichDetail(fixed));
      }
      all = all.concat(enriched);
      await appendLog('INFO', `source=${s['名称']} recs=${recs.length}`);
    }catch(e){
      await appendLog('ERROR', `crawl失敗 ${s['名称']||''} ${s['URL']||''}: ${e}`);
    }
  }

  const added = await upsertIntoDb(all);
  await appendLog('INFO', `収集完了: added=${added} total_in=${all.length}`);
}

main().catch(async (e)=>{
  await appendLog('ERROR', String(e));
  process.exit(1);
});
