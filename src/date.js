import { toHan } from './utils.js';

const ERAS = { '令和':2018, '平成':1988, '昭和':1925 };

const ymd = (y,m,d)=> `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

export function normalizeDate(s){
  if(!s) return '';
  s = toHan(String(s).trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = /(\d{4})[./年](\d{1,2})[./月](\d{1,2})/.exec(s);
  if (m) return ymd(m[1],m[2],m[3]);
  let w = /(令和|平成|昭和)\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (w) return ymd(ERAS[w[1]]+Number(w[2]), w[3], w[4]);
  return '';
}

export function parseDateJp(text, mode='LOOSE'){
  const s = toHan(String(text||''));
  let m = /(\d{4})[./年](\d{1,2})[./月](\d{1,2})/.exec(s);
  if (m) return ymd(m[1],m[2],m[3]);
  let w = /(令和|平成|昭和)\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (w) return ymd(ERAS[w[1]]+Number(w[2]), w[3], w[4]);
  if (mode!=='STRICT'){
    let a = /(\d{4})年?(\d{1,2})月(上旬|中旬|下旬)/.exec(s);
    if (a){
      const d = a[3]==='上旬'?5:a[3]==='中旬'?15:25;
      return ymd(a[1],a[2],d);
    }
    let b = /(\d{4})年度(内|まで)/.exec(s);
    if (b) return ymd(Number(b[1])+1,3,31);
    if (/随時|当面|常時受付/.test(s)) return '';
  }
  return '';
}

export function extractDeadlineSmart(text, explicitPattern, mode='LOOSE'){
  const s = toHan(String(text||''));
  if (explicitPattern){
    try{
      const m = new RegExp(explicitPattern).exec(s);
      if (m && m[1] && m[2] && m[3]) return ymd(m[1],m[2],m[3]);
    }catch(_){}
  }
  return parseDateJp(s, mode) || '';
}

export function extractStartDate(text, mode='LOOSE'){
  const s = toHan(String(text||''));
  const re = /(募集開始|受付開始|申請開始).{0,20}?(\d{4}[./-]\d{1,2}[./-]\d{1,2}|(令和|平成|昭和)\d{1,2}年\d{1,2}月\d{1,2}日)/;
  const m = re.exec(s);
  if (m) return normalizeDate(m[2]);
  return '';
}

export function detectClosed(text){
  const s = String(text||'');
  return /(募集(は)?終了|受付(は)?終了|終了しました|締切(済|りました)|申請(は)?終了)/.test(s);
}
