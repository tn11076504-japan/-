// src/index.js
//
// メインエントリ。
// 1) ソース一覧（ソースシート）を読む
// 2) タイプ=html のソースを順番にスクレイピングして案件DBに追加
// 3) 案件DB の本文(Q列)バックフィル
// 4) 本文(Q列)から補助率・上限額・対象などのメタ情報をバックフィル

import { loadSources, logInfo } from './sheets.js';
import { scrapeHtmlSource } from './scrapeHtml.js';
import {
  backfillBodiesFromSheet,
  backfillMetaFromBody,
} from './details.js';

async function main() {
  await logInfo('scrape start');

  const sources = await loadSources();
  const htmlSources = sources.filter((s) => (s['タイプ'] || '').trim() === 'html');

  await logInfo(`有効ソース数=${htmlSources.length}`);

  for (const src of htmlSources) {
    const name = src['名称'] || '';
    const type = src['タイプ'] || '';
    await logInfo(
      `source=${name} type=${type} start`
    );

    try {
      await scrapeHtmlSource(src);
    } catch (err) {
      await logInfo(
        `scrapeHtml error source=${name} msg=${err.message}`
      );
    }
  }

  // ここで本文(Q列)を埋める
  try {
    await backfillBodiesFromSheet();
  } catch (err) {
    await logInfo(`detail: 本文バックフィル中にエラー msg=${err.message}`);
  }

  // 本文(Q列)からメタ情報（補助率・上限額・対象など）を埋める
  try {
    await backfillMetaFromBody();
  } catch (err) {
    await logInfo(`meta: メタ情報バックフィル中にエラー msg=${err.message}`);
  }

  await logInfo('all done');
}

// GitHub Actions から node src/index.js で実行される想定
main().catch(async (err) => {
  await logInfo(`fatal error msg=${err.message}`);
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
