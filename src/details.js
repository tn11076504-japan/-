// src/details.js
import fetch from 'node-fetch';
import { stripTags } from './utils.js';
import { sheetsClient, SHEET_ID, logInfo, logWarn } from './sheets.js';

// 1回の本文バックフィル件数の上限
// 今は実質「全件」扱いになるよう十分大きくしておく
const BODY_BACKFILL_LIMIT = 1000;

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

  // 改行やタブなどの空白をまとめて 1 個に
  const normalized = rawText.replace(/\s+/g, ' ').trim();

  // Google スプレッドシート 1 セルの実質上限を考慮して 4万字でカット
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
 * ただし候補の総数（totalCandidates）は全行見た上でログに出す。
 */
export async function backfillBodiesFromSheet() {
  // 案件DBの A〜Q 列を全部取得（1行目はヘッダ）
  const range = '案件DB!A1:Q';
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    await logInfo('detail: 案件DBにデータ行がありません');
    return;
  }

  const headers = rows[0];
  const urlColIndex = headers.indexOf('URL');
  const bodyColIndex = headers.indexOf('本文');

  if (urlColIndex === -1 || bodyColIndex === -1) {
    await logWarn(
      'detail: 案件DBシートに URL 列 または 本文 列 が見つかりません'
    );
    return;
  }

  // 全行スキャンして「候補」をまず全部集める
  const candidates = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];

    const url = (row[urlColIndex] || '').toString().trim();
    // Q列の値は trim してから判定（スペースだけ入っている場合の対策）
    const bodyRaw = (row[bodyColIndex] || '').toString();
    const body = bodyRaw.trim();

    if (!url) continue; // URL が空なら対象外

    // すでに本文が入っている行はスキップ（'空欄' はバックフィル対象）
    if (body && body !== '空欄') continue;

    candidates.push({
      rowIndex: i + 1, // シートの行番号（1始まり）
      url,
    });
  }

  if (candidates.length === 0) {
    await logInfo('detail: 本文バックフィル候補なし');
    return;
  }

  // 今回実際に処理する件数
  const toProcess = candidates.slice(0, BODY_BACKFILL_LIMIT);

  await logInfo(
    `detail: 本文バックフィル開始 totalCandidates=${candidates.length} willProcess=${toProcess.length}`
  );

  let updatedCount = 0;

  for (const t of toProcess) {
    try {
      const text = await fetchBodyText(t.url);
      const value = text || '空欄';

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `案件DB!${columnNumberToLetter(bodyColIndex + 1)}${t.rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[value]],
        },
      });

      updatedCount++;
    } catch (err) {
      // 404 やネットワークエラーなど
      // 必要なら Q 列にも「ERROR: ...」と書き込むこともできる
      await logWarn(
        `detail: fetchBody error url=${t.url} msg=${err.message}`
      );
    }
  }

  await logInfo(
    `detail: 本文バックフィル完了 updated=${updatedCount}`
  );
}

/**
 * 列番号(1=A, 2=B, ...) を A1表記の列名に変換するユーティリティ。
 */
function columnNumberToLetter(colNum) {
  let temp = colNum;
  let letters = '';
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    temp = Math.floor((temp - 1) / 26);
  }
  return letters;
}
