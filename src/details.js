// src/details.js
// 詳細ページから本文全文を取得してレコードに追加するモジュール

import axios from "axios";
import * as cheerio from "cheerio";
import { stripTags } from "./utils.js";

/**
 * 詳細ページをフェッチして、本文全文を rec["本文"] に格納する
 *
 * 状態ごとの扱い:
 *  - 正常取得 & テキストあり  : 本文テキスト
 *  - 正常取得 & テキストなし: "【本文なし】"
 *  - 取得エラー             : "【取得エラー】"
 *
 * @param {Array<object>} records  scrapeHtml / scrapeRss で作られたレコード配列
 * @param {object} src            ソース行（ソースシート1行分）
 * @param {object} settings       各種設定
 * @param {function} logger       (level, message) 形式のログ関数
 * @returns {Promise<Array<object>>}
 */
export async function enrichRecordsWithDetails(records, src, settings, logger) {
  if (!Array.isArray(records) || records.length === 0) {
    return records;
  }

  const sourceName = (src && (src["名称"] || src["名前"])) || "";
  const timeoutMs = Number(settings.DETAIL_TIMEOUT_MS) || 15000;
  // スプレッドシート1セル上限対策: 50,000字より少し余裕を持たせて 30,000 字
  const maxChars = Number(settings.DETAIL_TEXT_MAX) || 30000;

  let fetched = 0;
  let textOk = 0;
  let noText = 0;
  let errorCount = 0;

  for (const rec of records) {
    const url = rec.URL || rec["URL"];
    if (!url) continue;

    try {
      const res = await axios.get(url, { timeout: timeoutMs });
      fetched++;

      const $ = cheerio.load(res.data);

      const bodyHtml =
        $("body").html() ||
        $("body").text() ||
        "";

      let text = stripTags(bodyHtml);
      text = text
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")        // ノーブレークスペース
        .replace(/[ \t]+/g, " ")        // 連続スペース → 1個
        .replace(/\n{3,}/g, "\n\n")     // 改行3連続以上 → 2つ
        .trim();

      if (maxChars > 0 && text.length > maxChars) {
        text = text.slice(0, maxChars);
      }

      if (text.length > 0) {
        rec["本文"] = text;
        textOk++;
      } else {
        // 取得は出来たが、本文っぽいテキストが無い
        rec["本文"] = "【本文なし】";
        noText++;
      }
    } catch (e) {
      errorCount++;
      rec["本文"] = "【取得エラー】";
      if (logger) {
        logger(
          "WARN",
          `detail fetch error source=${sourceName} url=${url} msg=${e.message}`
        );
      }
      // エラーでも処理は継続
    }
  }

  if (logger) {
    logger(
      "INFO",
      `detail summary source=${sourceName} total=${records.length} fetched=${fetched} textOk=${textOk} noText=${noText} error=${errorCount}`
    );
  }

  return records;
}
