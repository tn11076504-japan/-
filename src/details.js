// src/details.js
// 詳細ページから本文全文を取得してレコードに追加するモジュール
// 既存の「開始・締切・補助率…」の抽出ロジックには手を付けず、まずは本文取得に集中する

import axios from "axios";
import * as cheerio from "cheerio";
import { stripTags } from "./utils.js";

/**
 * 詳細ページをフェッチして、本文全文を rec["本文"] に格納する
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
  // シート1セルの上限は 50,000 文字なので、少し余裕を見て 30,000 文字にしておく
  const maxChars = Number(settings.DETAIL_TEXT_MAX) || 30000;

  let fetched = 0;
  let textOk = 0;

  for (const rec of records) {
    const url = rec.URL || rec["URL"];
    if (!url) continue;

    try {
      const res = await axios.get(url, { timeout: timeoutMs });
      fetched++;

      const $ = cheerio.load(res.data);

      // body 全体の HTML or テキストを取得
      const bodyHtml =
        $("body").html() ||
        $("body").text() ||
        "";

      // HTMLタグ除去＋余計な空白・改行を整形
      let text = stripTags(bodyHtml);
      text = text
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")        // ノーブレークスペース
        .replace(/[ \t]+/g, " ")        // 連続スペースを1つに
        .replace(/\n{3,}/g, "\n\n")     // 改行3連続以上 → 2つ
        .trim();

      if (maxChars > 0 && text.length > maxChars) {
        text = text.slice(0, maxChars);
      }

      // ★ ここが今回の追加ポイント：本文全文をレコードに保存
      rec["本文"] = text;
      textOk++;
    } catch (e) {
      if (logger) {
        logger(
          "WARN",
          `detail fetch error source=${sourceName} url=${url} msg=${e.message}`
        );
      }
      // エラーでも処理は継続し、本文は undefined/空欄のまま
    }
  }

  if (logger) {
    logger(
      "INFO",
      `detail summary source=${sourceName} total=${records.length} fetched=${fetched} textOk=${textOk}`
    );
  }

  return records;
}
