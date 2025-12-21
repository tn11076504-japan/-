// src/index.js
// メインエントリ: ソース一覧を読み → スクレイピング → 案件DBとログへ書き込み

import { readRange, appendRows } from './sheets.js';
import { scrapeHtml } from './scrapeHtml.js';
import { scrapeRss } from './scrapeRss.js';
import { hostOf } from './utils.js';
import { todayJst } from './date.js';

// 共通設定（不足していたらここを調整）
const SETTINGS = {
  FILTER_INCLUDE: '補助金|助成金|支援|公募|募集',
  FILTER_EXCLUDE: '終了しました|終了いたしました|中止|締切済',
  DEADLINE_MODE: 'LOOSE',
};

// --- 日時ヘルパー ----------------------------------------------------

function nowJstTimestamp() {
  const now = new Date();
  const tzOffsetMinutes = 9 * 60;
  const jst = new Date(now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset()) * 60000);
  // 2025-12-20T12:34:56 → 2025-12-20 12:34:56
  return jst.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// --- ロガー -----------------------------------------------------------

function createLogger() {
  /** @type {string[][]} */
  const buffer = [];

  function log(level, message) {
    const ts = nowJstTimestamp();
    buffer.push([ts, level, message]);
    // GitHub Actions のログにも出す
    console.log(`[${level}] ${message}`);
  }

  return {
    log,
    flush: async () => {
      if (buffer.length === 0) return;
      await appendRows('ログ!A:C', buffer);
    },
  };
}

// --- ソース行をオブジェクトに変換 ------------------------------------

function rowsToObjects(values) {
  if (!values || values.length === 0) return [];
  const [header, ...rows] = values;
  const keys = header.map((h) => String(h || '').trim());
  const result = [];

  for (const row of rows) {
    if (!row || row.every((c) => !c)) continue; // 全部空行はスキップ
    const obj = {};
    keys.forEach((k, i) => {
      obj[k] = row[i] ?? '';
    });
    result.push(obj);
  }
  return result;
}

function isSourceEnabled(src) {
  const raw = String(src['有効'] || '').trim();
  if (!raw) return false;
  const up = raw.toUpperCase();
  return (
    raw === '1' ||
    up === 'TRUE' ||
    up === 'ON' ||
    raw === '○' ||
    raw === '有'
  );
}

function sourceType(src) {
  const t = String(src['種別'] || '').trim().toLowerCase();
  if (t === 'rss' || t === 'feed') return 'rss';
  return 'html';
}

// --- ID 生成 ----------------------------------------------------------

function makeId(dateStr) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 4; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${s} ${dateStr}`;
}

// --- メイン処理 -------------------------------------------------------

async function main() {
  const logger = createLogger();
  const { log } = logger;

  log('INFO', 'scrape start');

  // 1) ソース一覧を取得
  const sourceValues = await readRange('ソース!A1:Z1000');
  const allSources = rowsToObjects(sourceValues);
  const enabledSources = allSources.filter(isSourceEnabled);

  log('INFO', `有効ソース数=${enabledSources.length}`);

  if (enabledSources.length === 0) {
    log('WARN', '有効なソースが 0 件です（ソースシートの「有効」列を確認してください）');
    await logger.flush();
    return;
  }

  // 2) 既存 URL セットを作る（案件DB の K 列 = URL）
  const existingUrlValues = await readRange('案件DB!K2:K10000');
  const existingUrlSet = new Set(
    existingUrlValues.flat().filter((v) => v && String(v).trim() !== ''),
  );

  const newRecords = [];
  let totalCandidates = 0;

  // 3) 各ソースを順番に処理
  for (const src of enabledSources) {
    const type = sourceType(src);
    const name =
      src['名称'] ||
      src['name'] ||
      hostOf(src['URL'] || '') ||
      '(無名ソース)';

    try {
      const result =
        type === 'rss'
          ? await scrapeRss(src, SETTINGS)
          : await scrapeHtml(src, SETTINGS);

      const { recs, stats } = result;
      totalCandidates += stats.total;

      let adoptedNew = 0;
      for (const rec of recs) {
        const url = String(rec.URL || '').trim();
        if (!url) continue;
        if (existingUrlSet.has(url)) continue;
        existingUrlSet.add(url);
        newRecords.push(rec);
        adoptedNew += 1;
      }

      log(
        'INFO',
        [
          `source=${name}`,
          `type=${stats.type}`,
          `total=${stats.total}`,
          `scopeOk=${stats.scopeOk ?? ''}`,
          `inHit=${stats.inHit}`,
          `out=${stats.out}`,
          `deadlineHit=${stats.deadlineHit}`,
          `recs=${recs.length}`,
          `adoptedNew=${adoptedNew}`,
        ].join(' '),
      );
    } catch (err) {
      log(
        'WARN',
        `source=${name} Exception: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 4) 案件DB への書き込み用に整形
  const today = todayJst();

  const rowsToAppend = newRecords.map((rec) => {
    const id = rec.id || makeId(today);
    return [
      id,
      rec.取得日 || today,
      rec.県 || '',
      rec.タイトル || '',
      rec.公募主体 || '',
      rec.募集開始 || '',
      rec.締切日 || '',
      rec.補助率 || '',
      rec.上限額 || '',
      rec.対象 || '',
      rec.URL || '',
    ];
  });

  if (rowsToAppend.length > 0) {
    await appendRows('案件DB!A2:K', rowsToAppend);
  }

  log(
    'INFO',
    `収集完了: added=${rowsToAppend.length} total_in=${totalCandidates}`,
  );
  log('INFO', 'scrape done');

  // 5) ログシートへ一括書き込み
  await logger.flush();
}

// GitHub Actions から実行されるエントリポイント
main().catch((err) => {
  console.error('致命的なエラー:', err);
  // ログシートに書けないタイミングなので、ここでは標準エラー出力のみ
});
