// src/details.js
// 各案件の詳細ページにアクセスして
// 「募集開始・締切日・補助率・上限額・対象」を抽出し、
// レコードオブジェクトの日本語キーに書き戻すモジュール。

import axios from "axios";
import * as cheerio from "cheerio";
import { stripTags, canonicalizeUrl } from "./utils.js";

/**
 * メインの詳細スクレイピング関数
 *
 * @param {Array<Object>} records  案件DBに追加予定のレコード配列
 * @param {Object} src             「ソース」シート1行分のオブジェクト
 * @param {Object} settings        全体設定（未使用なら {} でOK）
 * @param {Object} logger          ロガー（info/warn/error を持つ想定。なければ console）
 * @returns {Promise<Object>}      サマリ（total/fetched/ok/...）
 */
export async function enrichDetails(
  records,
  src,
  settings = {},
  logger = console
) {
  const log = createLogger(logger);

  const total = Array.isArray(records) ? records.length : 0;
  if (!total) {
    log.info("detail: no records to enrich");
    return makeSummary({ total });
  }

  // 「詳細取得」列が TRUE のものだけ詳細スクレイピングする
  const flag =
    (src["詳細取得"] ?? src["詳細"] ?? "").toString().toLowerCase() === "true";
  if (!flag) {
    log.info(
      `detail: skip (詳細取得=FALSE) source=${src["名称"] || src["name"] || ""}`
    );
    return makeSummary({ total });
  }

  // ソース行から個別REGEXを取得
  const patternStart = safePattern(src["募集開始REGEX"]);
  const patternDeadline = safePattern(src["締切抽出REGEX"]);
  const patternRate = safePattern(src["補助率REGEX"]);
  const patternLimit = safePattern(src["上限額REGEX"]);
  const patternTarget = safePattern(src["対象REGEX"]);

  let fetched = 0;
  let ok = 0;
  let startHit = 0;
  let deadlineHit = 0;
  let rateHit = 0;
  let limitHit = 0;
  let targetHit = 0;

  const sourceName = src["名称"] || src["name"] || "";

  for (const rec of records) {
    const urlRaw = rec.URL || rec["URL"];
    if (!urlRaw) continue;

    const url = canonicalizeUrl(urlRaw, src["URL"] || "");
    if (!url || !/^https?:\/\//i.test(url)) continue;

    try {
      const res = await axios.get(url, { timeout: 15000 });
      fetched++;

      const $ = cheerio.load(res.data);
      // ページ全体テキスト（HTMLタグ除去）
      const bodyText = stripTags($("body").text() || "");

      // --- 抽出処理 ---
      const start = pickStartDate(bodyText, patternStart);
      const deadline = pickDeadline(bodyText, patternDeadline);
      const rate = pickRate(bodyText, patternRate);
      const limit = pickLimit(bodyText, patternLimit);
      const target = pickTarget(bodyText, patternTarget);

      if (start) {
        rec.startDate = start; // 英語キー（将来用）
        rec["募集開始"] = start; // 案件DB用
        startHit++;
      }
      if (deadline) {
        rec.deadline = deadline;
        rec["締切日"] = deadline;
        deadlineHit++;
      }
      if (rate) {
        rec.rate = rate;
        rec["補助率"] = rate;
        rateHit++;
      }
      if (limit) {
        rec.limit = limit;
        rec["上限額"] = limit;
        limitHit++;
      }
      if (target) {
        rec.target = target;
        rec["対象"] = target;
        targetHit++;
      }

      if (start || deadline || rate || limit || target) {
        ok++;
      }
    } catch (e) {
      log.warn(
        `detail: fetch failed url=${url} source=${sourceName} msg=${
          e.message || e
        }`
      );
    }
  }

  const summary = makeSummary({
    total,
    fetched,
    ok,
    startHit,
    deadlineHit,
    rateHit,
    limitHit,
    targetHit,
  });

  log.info(
    `detail summary source=${sourceName} total=${summary.total} fetched=${summary.fetched} ok=${summary.ok}` +
      ` startHit=${summary.startHit} deadlineHit=${summary.deadlineHit}` +
      ` rateHit=${summary.rateHit} limitHit=${summary.limitHit} targetHit=${summary.targetHit}`
  );

  return summary;
}

/**
 * 互換用の別名（index.js がどの名前で呼んでいても動くようにエイリアスを定義）
 */
export async function fetchDetails(records, src, settings, logger) {
  return enrichDetails(records, src, settings, logger);
}
export async function scrapeDetails(records, src, settings, logger) {
  return enrichDetails(records, src, settings, logger);
}
export async function attachDetails(records, src, settings, logger) {
  return enrichDetails(records, src, settings, logger);
}

// default export も同じ関数にしておく
export default enrichDetails;

/* =========================
 *  以下、ヘルパー関数群
 * =======================*/

/**
 * logger が渡されていればそれを使い、なければ console を使う。
 */
function createLogger(logger) {
  if (!logger) return console;
  if (typeof logger.info === "function") return logger;
  // ざっくり info / warn / error だけ合わせておく
  return {
    info: console.log,
    warn: console.warn,
    error: console.error,
  };
}

/**
 * ソース行の文字列から安全に RegExp を作る。
 * 無効な正規表現だった場合は null を返す。
 */
function safePattern(srcValue) {
  if (!srcValue) return null;
  const s = String(srcValue).trim();
  if (!s) return null;
  try {
    // ユーザー入力側で /.../ フォーマットを使っていても
    // 素のパターンだけでも動くよう軽く吸収
    if (s.startsWith("/") && s.lastIndexOf("/") > 0) {
      const body = s.slice(1, s.lastIndexOf("/"));
      const flags = s.slice(s.lastIndexOf("/") + 1) || "g";
      return new RegExp(body, flags);
    }
    return new RegExp(s, "g");
  } catch (_) {
    return null;
  }
}

function findFirstMatch(text, pattern) {
  if (!pattern) return "";
  const m = text.match(pattern);
  if (!m || !m[0]) return "";
  return String(m[0]).trim();
}

/**
 * 募集開始日を抽出
 * 1. ソース行の 募集開始REGEX でヒットした最初の文字列
 * 2. なければ「募集期間」「受付開始」などの行から日付っぽい箇所
 */
function pickStartDate(text, patternStart) {
  let v = findFirstMatch(text, patternStart);
  if (v) return v;

  // 汎用ざっくりロジック
  // 「募集期間」「受付期間」「申請期間」などの周辺から YYYY年MM月DD日〜 形式を拾う
  const generic =
    /(募集期間|受付期間|申請期間|募集開始)[^0-9０-９]{0,10}([0-9０-９]{4}年[0-9０-９]{1,2}月[0-9０-９]{1,2}日)/;
  const m = text.match(generic);
  if (m && m[2]) return m[2].trim();

  return "";
}

/**
 * 締切日を抽出
 * 1. ソース行の 締切抽出REGEX でヒットした最初の文字列
 * 2. なければ「締切」「締め切り」「応募期限」などの周辺から日付を拾う
 */
function pickDeadline(text, patternDeadline) {
  let v = findFirstMatch(text, patternDeadline);
  if (v) return v;

  const generic =
    /(締切|締め切り|応募期限|申請期限)[^0-9０-９]{0,10}([0-9０-９]{4}年[0-9０-９]{1,2}月[0-9０-９]{1,2}日)/;
  const m = text.match(generic);
  if (m && m[2]) return m[2].trim();

  return "";
}

/**
 * 補助率を抽出
 * 例: 「補助率 2/3」「補助率 3/4」「補助率 1/2」「補助率 上限 ○○%」など
 */
function pickRate(text, patternRate) {
  let v = findFirstMatch(text, patternRate);
  if (v) return v;

  const generic =
    /(補助率[^0-9０-９]{0,5}([0-9０-９]+\/[0-9０-９]+|[0-9０-９]{1,2}％|[0-9０-９]{1,2}%))/;
  const m = text.match(generic);
  if (m && m[0]) return m[0].trim();

  return "";
}

/**
 * 上限額を抽出
 * 例: 「上限 ○○万円」「補助上限額 100万円」「補助金額 上限 50万円」など
 */
function pickLimit(text, patternLimit) {
  let v = findFirstMatch(text, patternLimit);
  if (v) return v;

  const generic =
    /(上限額|補助上限額|上限)[^0-9０-９]{0,10}([0-9０-９,，]+万円?|[0-9０-９,，]+円)/;
  const m = text.match(generic);
  if (m && m[0]) return m[0].trim();

  return "";
}

/**
 * 対象を抽出
 * 例: 「対象: 中小企業者」「対象事業者: 県内中小企業」など
 */
function pickTarget(text, patternTarget) {
  let v = findFirstMatch(text, patternTarget);
  if (v) return v;

  const generic = /(対象[者者企業]*[:：][^\n\r]+)/;
  const m = text.match(generic);
  if (m && m[0]) return m[0].trim();

  return "";
}

/**
 * サマリオブジェクト作成
 */
function makeSummary(partial) {
  return {
    total: partial.total ?? 0,
    fetched: partial.fetched ?? 0,
    ok: partial.ok ?? 0,
    startHit: partial.startHit ?? 0,
    deadlineHit: partial.deadlineHit ?? 0,
    rateHit: partial.rateHit ?? 0,
    limitHit: partial.limitHit ?? 0,
    targetHit: partial.targetHit ?? 0,
  };
}
