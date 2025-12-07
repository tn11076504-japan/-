// src/index.js
import { loadSources, loadSettings, appendToDb } from './sheets.js';
import { scrapeHtml } from './scrapeHtml.js';
import { scrapeRss } from './scrapeRss.js';

const SHEET_ID = process.env.SHEET_ID;

if (!SHEET_ID) {
  console.error('環境変数 SHEET_ID が設定されていません');
  process.exit(1);
}

async function main() {
  console.log('--- start scrape ---');
  const settings = await loadSettings(SHEET_ID);
  const sources = await loadSources(SHEET_ID);

  console.log(`有効なソース: ${sources.length}件`);

  const allRecords = [];

  for (const src of sources) {
    const type = String(src['タイプ'] || 'html').toLowerCase();
    console.log(`  src: ${src['名称']} (${type})`);

    try {
      let recs = [];
      if (type === 'rss') {
        recs = await scrapeRss(src, settings);
      } else {
        // デフォルトは html
        recs = await scrapeHtml(src, settings);
      }
      console.log(`    → ${recs.length} 件`);
      allRecords.push(...recs);
    } catch (e) {
      console.error(`    エラー: ${e.message}`);
    }
  }

  console.log(`合計 ${allRecords.length} 件を案件DBに追加します`);
  await appendToDb(SHEET_ID, allRecords);
  console.log('--- done ---');
}

main().catch((e) => {
  console.error('致命的エラー', e);
  process.exit(1);
});
