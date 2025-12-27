// src/scrapeHtml.js
// HTML一覧ページから補助金リンクを拾い、さらに各詳細ページを開いて
// 募集開始・締切・補助率・上限額・対象をできるだけ埋める。

import axios from 'axios';
import * as cheerio from 'cheerio';
import { stripTags, canonicalizeUrl, shouldSkipHref, truncate, toHan } from './utils.js';
import { extractDeadlineSmart } from './date.js';

/**
 * ソース1件ぶんをスクレイピング
 * @param {Object} src    ソースシート1行ぶん（列名→値）
 * @param {Object} settings 設定シートから読んだ共通設定
 * @returns {Promise<Array<Object>>} 案件レコード配列
 */
export async function scrapeHtml(src, settings) {
  const baseUrl = String(src['URL'] || '').trim();
  if (!baseUrl) return [];

  const scopePath = String(src['範囲(パス)'] || '').trim();

  const includePattern = String(src['抽出IN'] || settings.FILTER_INCLUDE || '');
  const excludePattern = String(src['抽出OUT'] || settings.FILTER_EXCLUDE || '');
  const mode = String(settings.DEADLINE_MODE || 'LOOSE');

  const inRe = includePattern ? new RegExp(includePattern) : null;
  const outRe = excludePattern ? new RegExp(excludePattern) : null;

  // 一覧ページ取得
  const res = await axios.get(baseUrl, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const records = [];
  const anchors = $('a[href]').toArray();

  for (const a of anchors) {
    const hrefRaw = $(a).attr('href') || '';
    if (shouldSkipHref(hrefRaw)) continue;

    const hrefAbs = canonicalizeUrl(hrefRaw, baseUrl);
    if (!hrefAbs) continue;

    // scopePath があれば、その配下だけに絞る
    if (scopePath) {
      try {
        const p = new URL(hrefAbs).pathname || '/';
        if (!p.startsWith(scopePath)) continue;
      } catch (_) {
        // URL パース失敗時はスコープチェックをスキップ
      }
    }

    const linkText = stripTags($(a).text() || '');
    const textNorm = linkText.replace(/\s+/g, ' ').trim();
    if (!textNorm) continue;

    if (inRe && !inRe.test(textNorm)) continue;
    if (outRe && outRe.test(textNorm)) continue;

    // まずはリンクテキストからざっくり締切を推定（あとで詳細ページで上書き）
    const initialDeadline = extractDeadlineSmart(
      textNorm,
      String(src['締切抽出REGEX'] || ''),
      mode
    );

    const rec = {
      県: src['県'] || '',
      タイトル: truncate(textNorm, 160) || '(無題)',
      公募主体: src['主体(固定)'] || '',
      募集開始: '',
      締切日: initialDeadline,
      補助率: '',
      上限額: '',
      対象: '',
      URL: hrefAbs,
      出典: src['名称'] || '',
      取得日: todayStr()
    };

    records.push(rec);
  }

  // ---- ここから詳細ページでの補強処理 ----
  for (const rec of records) {
    try {
      await enrichFromDetail(rec, src, settings, mode);
    } catch (e) {
      // スプレッドシートのログは index.js 側に任せる。
      // ここでは GitHub Actions のログにだけ出す。
      console.warn('detail enrich failed:', rec.URL, e && e.message ? e.message : e);
    }
  }

  return records;
}

/**
 * 詳細ページを開いて、募集開始・締切・補助率・上限額・対象を埋める
 */
async function enrichFromDetail(rec, src, settings, mode) {
  if (!rec.URL) return;

  const res = await axios.get(rec.URL, { timeout: 20000 });
  const html = res.data || '';
  const $ = cheerio.load(html);

  // body 内テキストを抽出して正規化
  const bodyHtml = $('body').html() || '';
  const rawText = stripTags(bodyHtml);
  const text = normalizeText(toHan(rawText));

  // ソースシートで個別指定があればそれを優先
  const deadlineRegex = String(src['締切抽出REGEX'] || '');
  const startRegex = String(src['募集開始REGEX'] || '');
  const rateRegex = String(src['補助率REGEX'] || '');
  const limitRegex = String(src['上限額REGEX'] || '');
  const targetRegex = String(src['対象REGEX'] || '');

  // 締切日（詳細ページ側が「不明」でなければ上書き）
  const deadlineFromDetail = extractDeadlineSmart(text, deadlineRegex, mode);
  if (deadlineFromDetail && deadlineFromDetail !== '不明') {
    rec.締切日 = deadlineFromDetail;
  }

  // 募集開始
  const start = extractStartDateGeneric(text, startRegex || deadlineRegex);
  if (start) rec.募集開始 = start;

  // 補助率・上限額・対象
  const rate = extractRate(text, rateRegex);
  if (rate) rec.補助率 = rate;

  const limit = extractLimit(text, limitRegex);
  if (limit) rec.上限額 = limit;

  const target = extractTarget(text, targetRegex);
  if (target) rec.対象 = target;
}

/** 改行・空白を整理して読みやすいテキストにする */
function normalizeText(t) {
  return String(t || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * 募集開始日をざっくり拾う
 * - customPattern があればそれを優先（() でキャプチャする想定）
 * - なければ「募集期間 2025年4月1日〜」のような典型パターンを探す
 */
function extractStartDateGeneric(text, customPattern) {
  try {
    if (customPattern) {
      const re = new RegExp(customPattern);
      const m = text.match(re);
      if (m && m[1]) return m[1];
    }
  } catch (e) {
    // 不正な正規表現は無視
  }

  // デフォルトパターン：「募集期間 2025年4月1日〜2025年5月31日」
  const re = /(募集(?:期間|開始)[：:\s]*)(\d{4}年\d{1,2}月\d{1,2}日)/;
  const m = text.match(re);
  if (m && m[2]) return m[2];

  return '';
}

/** 補助率を抽出（例：補助率 2/3 → 66%、補助率 50% など） */
function extractRate(text, customPattern) {
  try {
    if (customPattern) {
      const re = new RegExp(customPattern);
      const m = text.match(re);
      if (m && m[1]) return m[1].trim();
    }
  } catch (e) {
    // 無視
  }

  // 典型例：補助率 2/3、補助率 1/2、補助率 50%
  const frac = /補助率[：:\s]*([0-9]{1,2})\/([0-9]{1,2})/.exec(text);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (den !== 0) {
      const pct = Math.round((num / den) * 100);
      return `${pct}%`;
    }
  }

  const pct = /補助率[：:\s]*([0-9]{1,3})\s*%/.exec(text);
  if (pct && pct[1]) return `${pct[1]}%`;

  return '';
}

/** 上限額を抽出（例：上限額 100万円） */
function extractLimit(text, customPattern) {
  try {
    if (customPattern) {
      const re = new RegExp(customPattern);
      const m = text.match(re);
      if (m && m[1]) return m[1].trim();
    }
  } catch (e) {
    // 無視
  }

  const re = /(?:補助上限額|上限額|補助上限)[：:\s]*([0-9,]+(?:千|万|億)?円)/;
  const m = text.match(re);
  if (m && m[1]) return m[1].trim();

  return '';
}

/** 対象（対象者）を抽出（1行ぶんだけ） */
function extractTarget(text, customPattern) {
  try {
    if (customPattern) {
      const re = new RegExp(customPattern);
      const m = text.match(re);
      if (m && m[1]) return m[1].trim();
    }
  } catch (e) {
    // 無視
  }

  const re = /対象(?:者)?[：:\s]*([^\n。]+)/;
  const m = text.match(re);
  if (m && m[1]) return m[1].trim();

  return '';
}

/** 取得日（JST）の yyyy-mm-dd */
function todayStr() {
  const jst = new Date();
  const tzOffset = 9 * 60; // JST
  const utc = new Date(jst.getTime() + (jst.getTimezoneOffset() + tzOffset) * 60000);
  return utc.toISOString().slice(0, 10);
}
