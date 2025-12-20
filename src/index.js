// src/index.js
import {
  loadSources,
  loadSettings,
  appendToDb,
  appendLog
} from './sheets.js';
import { scrapeHtml } from './scrapeHtml.js';
import { scrapeRss } from './scrapeRss.js';

const SHEET_ID = process.env.SHEET_ID;

if (!SHEET_ID) {
  console.error('環境変数 SHEET_ID が設定されていません');
  process.exit(1);
}

async function main() {
  await appendLog(SHEET_ID, 'INFO', 'scrape start');

  const settings = await loadSettings(SHEET_ID);
  const sources = await loadSources(SHEET_ID);

  await appendLog(
    SHEET_ID,
    'INFO',
    `有効ソース数=${sources.length}`
  );
  console.log(`有効なソース: ${sources.length}件`);

  const allRecords = [];

  for (const src of sources) {
    const type = String(src['タイプ'] || 'html').toLowerCase();
    const name = src['名称'] || '';
    console.log(`  src: ${name} (${type})`);

    try {
      let recs = [];
      if (type === 'rss') {
        recs = await scrapeRss(src, settings);
      } else {
        // デフォルトは html
        recs = await scrapeHtml(src, settings);
      }
      console.log(`    → ${recs.length} 件`);

      await appendLog(
        SHEET_ID,
        'INFO',
        `source=${name} type=${type} recs=${recs.length}`
      );

      allRecords.push(...recs);
    } catch (e) {
      const msg = `source=${name} error=${e.message}`;
      console.error(`    エラー: ${msg}`);
      await appendLog(SHEET_ID, 'ERROR', msg);
    }
  }

  console.log(`合計 ${allRecords.length} 件を案件DBに追加します`);

  await appendLog(
    SHEET_ID,
    'INFO',
    `収集完了: added=${allRecords.length}`
  );

  await appendToDb(SHEET_ID, allRecords);

  await appendLog(SHEET_ID, 'INFO', 'scrape done');
}

main().catch(async (e) => {
  console.error('致命的エラー', e);
  try {
    await appendLog(SHEET_ID, 'ERROR', `fatal=${e.message}`);
  } catch {
    // ログ書き込みに失敗しても、ここでは諦める
  }
  process.exit(1);
});
