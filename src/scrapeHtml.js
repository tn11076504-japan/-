// src/scrapeHtml.js
// HTML 一覧ページからリンクを拾って案件レコードを生成

import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  stripTags,
  canonicalizeUrl,
  shouldSkipHref,
  truncate,
} from './utils.js';
import { extractDeadlineSmart, todayJst } from './date.js';

export async function scrapeHtml(src, settings) {
  const baseUrl = String(src['URL'] || '').trim();
  const scopePath = String(src['範囲(パス)'] || '').trim();
  const inRe = new RegExp(String(src['抽出IN'] || settings.FILTER_INCLUDE));
  const outRe = new RegExp(String(src['抽出OUT'] || settings.FILTER_EXCLUDE));
  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  const stats = {
    type: 'html',
    total: 0,        // a タグ総数
    scopeOk: 0,      // scopePath を満たした件数
    inHit: 0,        // IN 正規表現を通過した件数
    out: 0,          // OUT で除外された件数
    adopted: 0,      // レコードとして採用した件数
    deadlineHit: 0,  // 締切日が取れた件数
  };

  if (!baseUrl) {
    return { recs: [], stats };
  }

  const res = await axios.get(baseUrl, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const recs = [];
  $('a[href]').each((_, a) => {
    stats.total += 1;

    const hrefRaw = $(a).attr('href') || '';
    if (shouldSkipHref(hrefRaw)) return;

    const hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) return;

    // scopePath が指定されていればパスでフィルタ
    if (scopePath) {
      try {
        const p = new URL(hrefAbs).pathname || '/';
        if (!p.startsWith(scopePath)) return;
        stats.scopeOk += 1;
      } catch {
        return;
      }
    } else {
      stats.scopeOk += 1;
    }

    const text = stripTags($(a).text());
    if (!text) return;

    if (!inRe.test(text)) return;
    stats.inHit += 1;

    if (outRe.test(text)) {
      stats.out += 1;
      return;
    }

    const deadline = extractDeadlineSmart(text, String(src['締切抽出REGEX'] || ''), mode);
    if (deadline) stats.deadlineHit += 1;

    recs.push({
      県: src['県'] || '',
      タイトル: truncate(text, 160) || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: deadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: hrefAbs,
      出典: src['名称'] || '',
      取得日: todayJst(),
    });
    stats.adopted += 1;
  });

  return { recs, stats };
}
