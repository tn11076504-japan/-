// src/details.js
import fetch from 'node-fetch';
import { stripTags } from './utils.js';
import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

// 1回の本文バックフィル件数の上限
// 今はほぼ全件を一気に埋めたいので 200 にしておく（155行程度なら1発で終わる想定）
const BODY_BACKFILL_LIMIT = 200;

/**
 * 指定URLからHTMLを取得し、テキスト本文だけを抽出して返す。
 * 長すぎる場合はGoogleスプレッドシート1セルの上限を考慮してカットする。
 */
export async function fetchBodyText(url) {
  if (!url) return '';

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const rawText = stripTags(html) || '';

  // 改行やタブをまとめて、1行テキストに近い形に整える
  const normalized = rawText.replace(/\s+/g, ' ').trim();

  // Googleスプレッドシートの1セルは ~5万文字程度が上限なので、
  // 余裕をもって4万字でカット。
  const MAX_LEN = 40000;
  if (normalized.length > MAX_LEN) {
    return normalized.slice(0, MAX_LEN);
  }
  return normalized;
}

/**
 * 案件DBシートのうち、Q列「本文」が空 or '空欄' になっている行を対象に、
 * URL列（K列）のURLから本文を取得してQ列に書き込むバックフィル処理。
 *
 * 1回の実行では BODY_BACKFILL_LIMIT 件まで処理する。
 *
 * ※ 行全体(A〜Q)ではなく、「K列」と「Q列」だけを別々に読んで突き合わせることで、
 *    Google Sheets API の「行配列が途中で切れる」問題の影響を受けないようにしている。
 */
export async function backfillBodiesFromSheet() {
  // K列(URL) と Q列(本文) を 2〜最終行 まで取得
  const urlRange = '案件DB!K2:K';
  const bodyRange = '案件DB!Q2:Q';

  const [urlRes, bodyRes] = await Promise.all([
    sheetsClient.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: urlRange,
    }),
    sheetsClient.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: bodyRange,
    }),
  ]);

  const urlRows = urlRes.data.values || [];
  const bodyRows = bodyRes.data.values || [];

  // URL列と本文列のどちらか長い方まで見る
  const maxRows = Math.max(urlRows.length, bodyRows.length);

  const targets = [];

  for (let i = 0; i < maxRows; i++) {
    const url = (urlRows[i] && urlRows[i][0]) || '';
    const body = (bodyRows[i] && bodyRows[i][0]) || '';

    if (!url) continue; // URL が無い行は対象外
    // すでに本文が入っている行はスキップ（'空欄' はバックフィル対象）
    if (body && body !== '空欄') continue;

    targets.push({
      rowIndex: i + 2, // シートの行番号（ヘッダ行が1行なので +2）
      url,
    });

    if (targets.length >= BODY_BACKFILL_LIMIT) break;
  }

  await logInfo(`detail: 本文バックフィル開始 count=${targets.length}`);

  if (targets.length === 0) {
    return;
  }

  let updatedCount = 0;

  for (const t of targets) {
    try {
      const text = await fetchBodyText(t.url);
      const value = text || '空欄';

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `案件DB!Q${t.rowIndex}`, // 本文列(Q列)に書き込み
        valueInputOption: 'RAW',
        requestBody: {
          values: [[value]],
        },
      });

      updatedCount++;
    } catch (err) {
      await logWarn(
        `detail: fetchBody error url=${t.url} msg=${err.message}`
      );
    }
  }

  await logInfo(`detail: 本文バックフィル完了 updated=${updatedCount}`);
}
