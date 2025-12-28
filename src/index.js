import { loadSources, appendRecords, logInfo, logWarn } from './sheets.js';
import { scrapeHtml } from './scrapeHtml.js';
import { scrapeRss } from './scrapeRss.js';
import { enrichRecordsWithDetails } from './details.js';
import { toBool } from './utils.js';

async function main() {
  await logInfo('scrape start');

  const sources = await loadSources();
  const enabled = sources.filter((s) => toBool(s['有効']));

  await logInfo(`有効ソース数=${enabled.length}`);

  let totalAdded = 0;

  for (const src of enabled) {
    const type = String(src['タイプ'] || 'html').toLowerCase();
    const url = String(src['URL'] || '').trim();
    if (!url) {
      await logWarn(`source=${src['名称']} urlなしのためスキップ`);
      continue;
    }

    let recs = [];
    try {
      if (type === 'rss') {
        recs = await scrapeRss(src);
      } else {
        recs = await scrapeHtml(src);
      }
    } catch (e) {
      await logWarn(`source=${src['名称']} Exception: ${e.message}`);
      continue;
    }

    const { adoptedRecords } = await appendRecords(recs, src);
    totalAdded += adoptedRecords.length;

    const wantDetails = toBool(src['詳細取得']);
    if (wantDetails && adoptedRecords.length > 0) {
      await enrichRecordsWithDetails(adoptedRecords, src);
    }
  }

  await logInfo(`収集完了: added=${totalAdded}`);
  await logInfo('scrape done');
}

main().catch(async (err) => {
  console.error(err);
  try {
    await logWarn(`scrape fatal error: ${err.message}`);
  } catch (_) {
    // ignore log error
  }
  process.exit(1);
});
