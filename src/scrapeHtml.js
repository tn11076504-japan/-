// src/scrapeHtml.js
//
// 「ソース」シート 1 行分のオブジェクト src を受け取り、
// type=html のソースをスクレイピングして
// 案件DB に突っ込む用のレコード配列を返す。
//
// 404 などのエラー URL が混ざっていても、
// 例外で落ちずに WARN ログを出してスキップするようにしている。

import axios from 'axios';
import * as cheerio from 'cheerio';
import { todayJst } from './utils.js';
import { logInfo, logWarn } from './sheets.js';

/**
 * axios 共通設定
 * - タイムアウト
 * - 404 を含め HTTP ステータスで reject させない
 */
const http = axios.create({
  timeout: 15000,
  responseType: 'text',
  validateStatus: () => true, // 404 でも throw させない
});

/**
 * 安全に GET するラッパー。
 * - ネットワーク例外は catch して WARN ログに出し、null を返す
 * - HTTP 2xx 以外は WARN ログに出し、null を返す
 */
async function safeGet(url, label) {
  try {
    const res = await http.get(url);

    if (res.status < 200 || res.status >= 300) {
      await logWarn(
        `scrapeHtml: HTTP ${res.status} url=${url} label=${label ?? ''}`
      );
      return null;
    }

    return res.data || '';
  } catch (err) {
    await logWarn(
      `scrapeHtml: request error url=${url} label=${label ?? ''} msg=${
        err?.message || err
      }`
    );
    return null;
  }
}

/**
 * 公開インターフェース：
 * ソース 1 件分を受け取り、レコード配列を返す。
 *
 * 返すレコードのキーは appendRecords() が期待しているもの：
 *  - 取得日
 *  - 県
 *  - タイトル
 *  - 公募主体
 *  - 募集開始
 *  - 締切日
 *  - 補助率
 *  - 上限額
 *  - 対象
 *  - URL
 */
export async function scrapeHtmlSource(src) {
  const type = src['タイプ'] || '';
  if (type !== 'html') {
    // html 以外はここでは扱わない
    return [];
  }

  const name = src['名称'] || '';
  try {
    // いま対応しているのは O-RIC ニュース系のみ。
    // 必要に応じてここに if / switch でソース別ロジックを追加する。
    if (name.includes('O-RIC')) {
      return await scrapeOricNews(src);
    }

    // 未対応の html ソース
    await logWarn(`scrapeHtml: 未対応の html ソース name=${name}`);
    return [];
  } catch (err) {
    // 想定外の例外が出てもジョブを落とさない
    await logWarn(
      `scrapeHtml: fatal error source=${name} msg=${err?.message || err}`
    );
    return [];
  }
}

/**
 * O-RIC ニュース（補助金関連を含む）用スクレイパ
 *
 * 前提：
 * - ソース行に
 *    一覧URL → src["一覧URL"] もしくは src["URL"]
 *    県固定  → src["県"] または src["県(固定)"]
 *    主体固定→ src["主体(固定)"]
 *   が入っている想定。
 *
 * やっていること：
 * - 一覧ページから「/news/info/」または「/news/entry/」へ飛ぶ a タグを拾う
 * - a タグのテキストをタイトルとして採用
 * - 詳細ページまでは取りに行かない（本文は details.js 側で backfill）
 */
async function scrapeOricNews(src) {
  const listUrl = src['一覧URL'] || src['URL'];
  if (!listUrl) {
    await logWarn('scrapeHtml: O-RIC ソースに URL/一覧URL がありません');
    return [];
  }

  const html = await safeGet(listUrl, 'O-RIC list');
  if (!html) {
    // 404 などで取得できなかった
    return [];
  }

  const $ = cheerio.load(html);
  const base = new URL(listUrl);

  const records = [];

  // O-RIC の構造にそこそこマッチしつつ、余計なリンクはなるべく避けるため、
  // main 要素近辺の a タグのうち、href に /news/info/ または /news/entry/ を含むものだけ拾う。
  $('main a, #main a, .contents a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();

    if (!href) return;
    if (!text) return;

    // 補助金ニュースだけを狙って /news/info/ or /news/entry/ に絞る
    if (!href.includes('/news/info/') && !href.includes('/news/entry/')) {
      return;
    }

    let url;
    try {
      url = new URL(href, base).href;
    } catch {
      // 不正な URL はスキップ
      return;
    }

    records.push({
      取得日: todayJst(),
      県: src['県'] || src['県(固定)'] || '',
      タイトル: text,
      公募主体: src['公募主体'] || src['主体(固定)'] || '',
      募集開始: '',
      締切日: '',
      補助率: '',
      上限額: '',
      対象: '',
      URL: url,
    });
  });

  await logInfo(
    `scrapeHtml: O-RIC ニュース name=${src['名称'] || ''} total=${records.length}`
  );

  return records;
}
