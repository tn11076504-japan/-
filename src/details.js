import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  sheetsClient as sheets,
  SHEET_ID,
  logInfo,
  logWarn,
} from './sheets.js';
import { normalizeSpace } from './utils.js';
import { extractDateRange, extractFirstDate } from './date.js';

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function fetchDetailsFromPage(url, src) {
  const res = await axios.get(url, { timeout: 15000 });
  const html = res.data;
  const $ = cheerio.load(html);

  const details = {
    start: '',
    deadline: '',
    rate: '',
    limit: '',
    target: '',
  };

  // 1) th/td の表を優先的に見る
  $('tr').each((_, tr) => {
    const th = normalizeSpace($(tr).find('th').text());
    const td = normalizeSpace($(tr).find('td').text());
    if (!th || !td) return;

    // 募集期間 → 開始と締切をまとめて取る
    if (/募集期間|申請期間|受付期間|公募期間/.test(th)) {
      const [s, e] = extractDateRange(td, src['締切抽出REGEX']);
      if (s && !details.start) details.start = s;
      if (e && !details.deadline) details.deadline = e;
    } else if (/募集開始|受付開始/.test(th)) {
      if (!details.start) {
        const d = extractFirstDate(
          td,
          src['募集開始REGEX'] || src['締切抽出REGEX'],
        );
        if (d) details.start = d;
      }
    } else if (/締切|締め切り|応募期限|受付終了/.test(th)) {
      if (!details.deadline) {
        const d = extractFirstDate(td, src['締切抽出REGEX']);
        if (d) details.deadline = d;
      }
    }

    if (!details.rate && /補助率|助成率|支援率/.test(th)) {
      details.rate = td;
    }
    if (!details.limit && /上限額|限度額|最大額|補助上限/.test(th)) {
      details.limit = td;
    }
    if (!details.target && /対象[者]?/.test(th)) {
      details.target = td;
    }
  });

  // 2) 表で取れなかったものは本文テキストから拾う
  const bodyText = normalizeSpace($('body').text());

  if (!details.deadline) {
    const d = extractFirstDate(bodyText, src['締切抽出REGEX']);
    if (d) details.deadline = d;
  }

  if (!details.start) {
    const idx = bodyText.search(/(募集開始|申請開始|受付開始)/);
    if (idx >= 0) {
      const segment = bodyText.slice(idx, idx + 80);
      const d = extractFirstDate(
        segment,
        src['募集開始REGEX'] || src['締切抽出REGEX'],
      );
      if (d) details.start = d;
    }
  }

  if (!details.rate) {
    const m = bodyText.match(/補助率[：:は]?([^。\n\r]+)/);
    if (m) details.rate = normalizeSpace(m[1]);
  }
  if (!details.limit) {
    const m = bodyText.match(/(上限額|補助上限|限度額)[：:は]?([^。\n\r]+)/);
    if (m) details.limit = normalizeSpace(m[2] || m[1]);
  }
  if (!details.target) {
    const m = bodyText.match(/対象[者]?[：:は]?([^。\n\r]+)/);
    if (m) details.target = normalizeSpace(m[1]);
  }

  return details;
}

// adoptedRecords: appendRecords が返した [{ id, url }, ...]
export async function enrichRecordsWithDetails(adoptedRecords, src) {
  if (!adoptedRecords || adoptedRecords.length === 0) return;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: '案件DB!A1:K',
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return;
  const headers = rows[0];

  const urlIdx = headers.indexOf('URL');
  const startIdx = headers.indexOf('募集開始');
  const deadlineIdx = headers.indexOf('締切日');
  const rateIdx = headers.indexOf('補助率');
  const limitIdx = headers.indexOf('上限額');
  const targetIdx = headers.indexOf('対象');

  if (urlIdx === -1) return;

  const urlToRow = new Map();
  rows.slice(1).forEach((row, i) => {
    const url = row[urlIdx];
    if (url) urlToRow.set(url, i + 2); // 1-based + ヘッダ行
  });

  const updates = [];
  let fetched = 0;
  let ok = 0;
  let startHit = 0;
  let deadlineHit = 0;
  let rateHit = 0;
  let limitHit = 0;
  let targetHit = 0;

  for (const rec of adoptedRecords) {
    const url = rec.url;
    const rowNum = urlToRow.get(url);
    if (!rowNum) continue;

    try {
      const detail = await fetchDetailsFromPage(url, src);
      fetched++;

      let any = false;

      if (detail.start && startIdx >= 0) {
        updates.push({
          range: `案件DB!${colLetter(startIdx + 1)}${rowNum}`,
          values: [[detail.start]],
        });
        startHit++;
        any = true;
      }

      if (detail.deadline && deadlineIdx >= 0) {
        updates.push({
          range: `案件DB!${colLetter(deadlineIdx + 1)}${rowNum}`,
          values: [[detail.deadline]],
        });
        deadlineHit++;
        any = true;
      }

      if (detail.rate && rateIdx >= 0) {
        updates.push({
          range: `案件DB!${colLetter(rateIdx + 1)}${rowNum}`,
          values: [[detail.rate]],
        });
        rateHit++;
        any = true;
      }

      if (detail.limit && limitIdx >= 0) {
        updates.push({
          range: `案件DB!${colLetter(limitIdx + 1)}${rowNum}`,
          values: [[detail.limit]],
        });
        limitHit++;
        any = true;
      }

      if (detail.target && targetIdx >= 0) {
        updates.push({
          range: `案件DB!${colLetter(targetIdx + 1)}${rowNum}`,
          values: [[detail.target]],
        });
        targetHit++;
        any = true;
      }

      if (any) ok++;
    } catch (e) {
      await logWarn(`detail error url=${url} ${e.message}`);
    }
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
  }

  await logInfo(
    `detail summary source=${src['名称']} total=${adoptedRecords.length} fetched=${fetched} ok=${ok} startHit=${startHit} deadlineHit=${deadlineHit} rateHit=${rateHit} limitHit=${limitHit} targetHit=${targetHit}`,
  );
}
