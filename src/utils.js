export const stripTags = (s) => String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
export const truncate = (s, n=160) => {
  s = String(s||''); return s.length>n? s.slice(0,n-1)+'…' : s;
};
export const toHan = (s) => String(s||'').replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0));

export function canonicalizeUrl(href, base){
  try{
    if(!href) return '';
    const h = String(href).trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (h.startsWith('//')) return 'https:' + h;
    if (/^(#|mailto:|tel:|javascript:|\?)/i.test(h)) return ''; // 保存しない
    if (!base) return h; // 後で修復
    return new URL(h, base).toString();
  }catch(e){ return href; }
}
export const hostOf = (abs) => { try { return new URL(abs).host; } catch(_) { return ''; } };

export const shouldSkipHref = (href) => {
  if(!href) return true;
  if (/^(#|mailto:|tel:|javascript:|\?)/i.test(href)) return true;
  if (/#group/i.test(href)) return true;
  return false;
};
