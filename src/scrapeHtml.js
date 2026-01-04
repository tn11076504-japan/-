// src/scrapeHtml.js
//
// 各 HTML ソース（ソースシートの「タイプ=html」の行）から
// 「タイトル＋URL（＋最低限のメタ）」だけを抽出して
// 案件DB シートに追記する処理。
//
// 特徴:
// - axios の validateStatus を使って 404/5xx でも throw させず、WARN ログだけ出して続行
// - HTML パースは cheerio を使用
// - まずは「補助金・助成・支援・公募」などのキーワードを含むリンクだけを拾う
// - 補助率・上限額・対象などはここでは入れず、あとで本文(Q列)からバックフィルする想定

import axios from 'axios';
import cheerio from 'cheerio';
import { appendRecords, logInfo, logWarn } from './sheets.js';

/**
 * HTML を取得する共通関数。
 * - validateStatus で 2xx 以外でも例外は投げない
 * - 4xx/5xx の場合は WARN ログを出して null を返す
 */
async function fetchHtml(url, sourceName) {
  try {
    const res = await axios.get(url, {
      responseType: 'text',
      // どんなステータスコードでも一旦レスポンスを返す
      validateStatus: () => true,
    });

    if (res.status >= 400) {
      await logWarn(
        `scrapeHtml: HTTP ${res.status} url=${url} source=${sourceName}`
      );
      // 404 などは null を返して呼び出し元でスキップ
      return null;
    }

    return res.data;
  } catch (err) {
    await logWarn(
      `scrapeHtml: fetch error url=${url} source=${sourceName} msg=${err.message}`
    );
    return null;
  }
}

/**
 * テキストの正規化（連続する空白を 1 個に・前後の空白削除）
 */
function normalizeText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 指定 HTML から「補助金関連ぽいリンク」を抽出する汎用パーサ。
 *
 * ロジック:
 * - <a> タグを全部舐める
 * - タイトル文字列に「補助」「助成」「支援」「公募」「補償」などの
 *   キーワードが含まれているものだけ採用
 * - href を絶対 URL に整形
 */
function extractSubsidyLinksGeneric(html, baseUrl) {
  const $ = cheerio.load(html);

  const results = [];
  const seen = new Set();

  $('a').each((_, el) => {
    const rawTitle = $(el).text();
    const title = normalizeText(rawTitle);
    if (!title) return;

    // 補助金関連っぽいキーワード
    if (!/[補助金補助|助成|支援|補償|公募|募集]/.test(title)) {
      return;
    }

    let href = $(el).attr('href') || '';
    href = href.trim();
    if (!href) return;

    // メールリンク等は除外
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;

    // 絶対 URL へ
    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    if (seen.has(url)) return;
    seen.add(url);

    results.push({ title, url });
  });

  return results;
}

/**
 * O-RIC ニュース用のパーサ。
 *
 * 現状の HTML 構造を直接は見れていないため、
 *   - /news/info/ または /news/entry/
 * を含むリンクだけに限定した上で、
 * 上記の補助金キーワードフィルタを適用する方式にしています。
 */
function extractOricNewsLinks(html, baseUrl) {
  const $ = cheerio.load(html);

  const results = [];
  const seen = new Set();

  $('a[href*="/news/info/"], a[href*="/news/entry/"]').each((_, el) => {
    const rawTitle = $(el).text();
    const title = normalizeText(rawTitle);
    if (!title) return;

    if (!/[補助金補助|助成|支援|補償|公募|募集]/.test(title)) {
      return;
    }

    let href = $(el).attr('href') || '';
    href = href.trim();
    if (!href) return;

    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;

    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    if (seen.has(url)) return;
    seen.add(url);

    results.push({ title, url });
  });

  return results;
}

/**
 * 1つのソース（ソースシートの1行分）に対して HTML スクレイピングを実行し、
 * 案件DB シートにレコードを追加するメイン関数。
 *
 * index.js から
 *   import { scrapeHtmlSource } from './scrapeHtml.js';
 * として呼び出される前提。
 */
export async function scrapeHtmlSource(src) {
  const name = (src['名称'] || '').trim();
  const listUrl =
    (src['URL'] || src['一覧URL'] || src['リストURL'] || '').trim();

  if (!listUrl) {
    await logWarn(
      `scrapeHtml: URL 未設定の html ソースをスキップします name=${name}`
    );
    return;
  }

  const html = await fetchHtml(listUrl, name);
  if (!html) {
    // 404 などで HTML が取れなかった場合はここで終了
    return;
  }

  let links;

  // ソース名でざっくり切り替え（必要に応じて case を増やす）
  if (name.includes('O-RIC') || name.includes('O-RICニュース')) {
    links = extractOricNewsLinks(html, listUrl);
  } else {
    // それ以外は汎用パーサ
    links = extractSubsidyLinksGeneric(html, listUrl);
  }

  if (!links || links.length === 0) {
    await logInfo(`scrapeHtml: no subsidy-like links found name=${name}`);
    // appendRecords 内でのログに加えて、ここでも念のため情報ログ
    return;
  }

  // appendRecords が URL で重複チェックする前提で、
  // ここでは最低限のフィールドだけ埋めて渡す。
  const records = links.map((item) => ({
    title: item.title,
    url: item.url,
    // ここではまだ細かいメタは入れない。
    owner: '',      // 公募主体は後で本文から抽出する or src['主体(固定)'] を sheets 側で補完
    startDate: '',  // 募集開始日 → 後で本文(Q列)から抽出する想定
    endDate: '',    // 締切日      → 同上
    rate: '',       // 補助率      → 同上
    limit: '',      // 上限額      → 同上
    target: '',     // 対象        → 同上
  }));

  await appendRecords(records, src);
}
