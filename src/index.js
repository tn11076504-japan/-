// src/index.js
//
// エントリーポイント
// - ソース一覧を読む
// - HTML / RSS をスクレイピング
// - 詳細ページで補強
// - 案件DB と ログ に書き込む
//

import { readSources, appendRecords, logInfo, logWarn, logError } from './sheets.js';
import { scrapeHtml } from './scrapeHtml.js';
import { scrapeRss } from './scrapeRss.js';
import { enrichRecordsWithDetails } from './details.js';

const SETTINGS = {
  FILTER_INCLUDE: '補助金|助成金|支援|支援制度|補助事業|補助対象|販路開拓|展示会|ビジネスマッチング|セミナー',
  FILTER_EXCLUDE: '終了しました|募集は終了|申請は終了|中止となりました',
  DEADLINE_MODE: 'SMART',
  MAX_DETAIL_PER_SOURCE: 80
};

async function main() {
  try {
    await logInfo('scrape start');

    const sources = await readSources();
    await logInfo(`有効ソース数=${sources.length}`);

    const allRecords = [];
    for (const src of sources) {
      const label = `source=${src.name} url=${src.url}`;
      try {
        let recs = [];
        if (src.type === 'html') {
          recs = await scrapeHtml(src, SETTINGS, msg => logInfo(msg));
        } else if (src.type === 'rss') {
          recs = await scrapeRss(src, SETTINGS, msg => logInfo(msg));
        } else {
          await logWarn(`${label} unsupported type=${src.type}`);
          continue;
        }

        if (!recs || recs.length === 0) {
          await logInfo(`${label} recs=0 (skipped append)`);
          continue;
        }

        // 詳細ページで補強
        if (src.detail) {
          await enrichRecordsWithDetails(
            recs,
            src,
            SETTINGS,
            msg => logInfo(msg)
          );
        }

        allRecords.push(...recs);
      } catch (e) {
        await logError(`${label} error=${e.message || e.toString()}`);
      }
    }

    if (allRecords.length > 0) {
      await appendRecords(allRecords);
      await logInfo(`収集完了: added=${allRecords.length}`);
    } else {
      await logInfo('収集完了: added=0');
    }

    await logInfo('scrape done');
  } catch (e) {
    await logError(`fatal error=${e.message || e.toString()}`);
    process.exitCode = 1;
  }
}

main();
