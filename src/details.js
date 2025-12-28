// src/details.js
// URL から本文を取得して rec.本文 にセットするモジュール

import axios from "axios";
import * as cheerio from "cheerio";

/**
 * records: scrapeHtml / scrapeRss で作ったレコード配列
 *  - 各レコードには URL (or url) が入っている前提
 *
 * 戻り値:
 *  - 各レコードに .本文 を追加した新しい配列
 *  - 本文を取れなかった場合は 本文 は "" のまま
 */
export async function enrichRecordsWithDetails(records) {
  const result = [];

  for (const rec of records) {
    // URL フィールド名の揺れに一応対応
    const url = rec.URL || rec.Url || rec.url;

    if (!url) {
      // URL がそもそも無ければ本文は空にして次へ
      result.push({ ...rec, 本文: "" });
      continue;
    }

    try {
      const res = await axios.get(url, {
        timeout: 15000, // 15秒でタイムアウト
      });

      const html = res.data;
      const $ = cheerio.load(html);

      // よくあるコンテンツ領域を優先的に見る
      let text =
        $("main").text().trim() ||
        $("article").text().trim() ||
        $("#contents").text().trim() ||
        $("#content").text().trim() ||
        $("body").text().trim();

      // 空白を整理（改行やタブをスペース1個に潰す）
      text = text.replace(/\s+/g, " ").trim();

      // セルのサイズ対策で、長すぎるときは先頭だけ残す
      const MAX_LEN = 8000; // 必要ならここを調整
      if (text.length > MAX_LEN) {
        text = text.slice(0, MAX_LEN);
      }

      result.push({
        ...rec,
        本文: text || "", // 取れなければ空文字
      });
    } catch (err) {
      // 失敗しても全体が止まらないようにしておく
      result.push({
        ...rec,
        本文: "",
      });
    }
  }

  return result;
}
