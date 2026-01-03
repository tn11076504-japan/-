// src/index.js
import { loadSources, appendRecords, logInfo } from './sheets.js';
import { scrapeHtmlSource } from './scrapeHtml.js';
import {
  backfillBodiesFromSheet,
  backfillMetaFromBody,
} from './details.js';

async function main() {
  await logInfo('scrape start');

  // ソース一覧（ソースシート）を読み込む
  const sources = await loadSources();

  for (const src of sources) {
    // タイプでフィルタする場合はここ
    if ((src['タイプ'] || '').toLowerCase() !== 'html') {
      continue;
    }

    const records = await scrapeHtmlSource(src);
    await appendRecords(records, src);
  }

  await logInfo('scrape done');

  // --- バックフィル系処理 ---

  // 1. 本文(Q列)が空の行 → URLから本文を取得してQ列を埋める
  await backfillBodiesFromSheet();

  // 2. 本文(Q列)が入っている行 → 補助率/上限額/対象をできる範囲で自動抽出
  await backfillMetaFromBody();

  await logInfo('all done');
}

main().catch(async (err) => {
  await logInfo(`ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
