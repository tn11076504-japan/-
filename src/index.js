import { toBool } from './utils.js';
import {
  loadSources,
  appendRecords,
  logInfo,
  logWarn,
  findRecordsNeedingBody,
  writeBodies,
} from './sheets.js';
import { scrapeHtmlSource } from './scrapeHtml.js';
import { scrapeRssSource } from './scrapeRss.js';
import { fetchBodyText } from './details.js';

// ==============================
// メインのスクレイピング処理
// ==============================

async function scrapeAllSources() {
  const sources = await loadSources();
  const activeSources = sources.filter((s) => toBool(s['有効']));

  await logInfo(`有効ソース数=${activeSources.length}`);

  let totalAdopted = 0;

  for (const src of activeSources) {
    try {
      const type = (src['タイプ'] || '').toLowerCase();
      let records = [];

      if (type === 'html') {
        records = await scrapeHtmlSource(src);
      } else if (type === 'rss') {
        records = await scrapeRssSource(src);
      } else {
        await logWarn(
          `source=${src['名称']} 未対応タイプ type=${src['タイプ']}`,
        );
        continue;
      }

      const { adoptedRecords } = await appendRecords(records, src);
      totalAdopted += adoptedRecords.length;
    } catch (err) {
      await logWarn(
        `source=${src['名称']} Exception: ${err.message || String(err)}`,
      );
    }
  }

  await logInfo(`収集完了: added=${totalAdopted}`);
}

// ==============================
// Q列「本文」バックフィル処理
// ==============================

async function backfillBodiesOnce(limit = 20) {
  const targets = await findRecordsNeedingBody(limit);
  if (!targets.length) {
    await logInfo('detail: 本文バックフィル対象レコードなし');
    return;
  }

  await logInfo(`detail: 本文バックフィル開始 count=${targets.length}`);

  const filled = [];

  for (const t of targets) {
    try {
      const body = await fetchBodyText(t.url);
      filled.push({ ...t, body: body || '空欄' });
    } catch (err) {
      await logWarn(
        `detail: fetchBody error url=${t.url} msg=${err.message || String(err)}`,
      );
      filled.push({ ...t, body: '空欄' });
    }
  }

  await writeBodies(filled);
  await logInfo(`detail: 本文バックフィル完了 updated=${filled.length}`);
}

// ==============================
// エントリポイント
// ==============================

async function main() {
  await logInfo('scrape start');
  await scrapeAllSources();
  await logInfo('scrape done');

  // スクレイピングのついでに、毎回少しずつ既存レコードの本文も埋めていく
  await backfillBodiesOnce(20);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await logWarn(`FATAL: ${err.message || String(err)}`);
  } catch (_) {
    // ログ書き込みに失敗してもここでは何もしない
  }
  process.exit(1);
});
