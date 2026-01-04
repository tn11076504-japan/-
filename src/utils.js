// src/utils.js

/**
 * ごく基本的な HTML エンティティをデコードする簡易関数。
 * 外部ライブラリは使わない。
 */
function decodeHtmlEntities(str) {
  if (!str) return '';

  const map = {
    '&nbsp;': ' ',
    '&#160;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
  };

  let result = str.replace(
    /(&nbsp;|&#160;|&lt;|&gt;|&amp;|&quot;|&#39;)/g,
    (m) => map[m] || m
  );

  // 数値参照 &#1234; / &#x1F600; にも対応
  result = result
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) =>
      String.fromCharCode(parseInt(num, 10))
    );

  return result;
}

/**
 * HTML から script/style/コメント/タグを削除し、生テキストだけにする。
 * 文字化けを減らしつつ、余計な改行・空白も整理する。
 */
export function stripTags(html) {
  if (!html) return '';

  let text = String(html);

  // script, style, コメントを除去
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // それ以外のタグを除去
  text = text.replace(/<[^>]+>/g, ' ');

  // エンティティ→プレーンテキスト
  text = decodeHtmlEntities(text);

  // 連続する空白・改行をまとめる
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 現在時刻を JST(UTC+9) に変換した Date を返す。
 * 実行環境のタイムゾーンに依存しないように、一度 UTC に揃えてから +9h する。
 */
export function getJstNow() {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const jstTime = utcTime + 9 * 60 * 60 * 1000;
  return new Date(jstTime);
}

/**
 * JST Date -> 'YYYY/MM/DD'
 * 案件DB の「取得日」用。
 */
export function formatJstDate(jstDate) {
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/**
 * JST Date -> 'YYYY-MM-DD HH:mm:ss'
 * ログ A 列用。
 */
export function formatJstDateTime(jstDate) {
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstDate.getUTCDate()).padStart(2, '0');
  const hh = String(jstDate.getUTCHours()).padStart(2, '0');
  const mm = String(jstDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(jstDate.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * 本文テキストから補助率だけを抽出する。
 *
 * 優先順位：
 *   1. 「補助率」「助成率」付近 80 文字から % を探す
 *   2. 同じ範囲で 1/2, 2/3 などの分数
 *   3. 「3分の2」→ 2/3 の形に正規化
 *
 * 返り値： '1/2', '2/3', '50%' 等。見つからなければ ''。
 */
export function extractSubsidyRateFromText(text) {
  if (!text) return '';

  const keywords = ['補助率', '助成率', '補助金率'];
  let idx = -1;

  for (const kw of keywords) {
    const i = text.indexOf(kw);
    if (i !== -1) {
      idx = i;
      break;
    }
  }

  let area;
  if (idx === -1) {
    // キーワードが見つからない場合は冒頭 200 文字だけを対象にする
    area = text.slice(0, 200);
  } else {
    const start = Math.max(0, idx);
    const end = Math.min(text.length, idx + 80);
    area = text.slice(start, end);
  }

  // 全角数字／スラッシュ／％ を半角に揃える & 空白除去
  const zenkakuMap = {
    '０': '0',
    '１': '1',
    '２': '2',
    '３': '3',
    '４': '4',
    '５': '5',
    '６': '6',
    '７': '7',
    '８': '8',
    '９': '9',
    '／': '/',
    '％': '%',
  };

  const normalized = area
    .replace(/[０-９／％]/g, (ch) => zenkakuMap[ch] ?? ch)
    .replace(/\s+/g, '');

  // 1) パーセント表記（70%, 50% など）
  const mPercent = normalized.match(/(\d{1,3})%/);
  if (mPercent) {
    return `${mPercent[1]}%`;
  }

  // 2) 分数表記 1/2, 2/3 など
  const mFrac = normalized.match(/(\d{1,2}\/\d{1,2})/);
  if (mFrac) {
    const [numStr, denStr] = mFrac[1].split('/');
    const den = Number(denStr);
    // 4/21（日時）などを避けるため、分母 12 以下だけ許可
    if (den > 0 && den <= 12) {
      return mFrac[1];
    }
  }

  // 3) 「3分の2」→ 2/3 の形式
  const mBunno = normalized.match(/(\d{1,2})分の(\d{1,2})/);
  if (mBunno) {
    const bunbo = Number(mBunno[1]);
    const bunshi = mBunno[2];
    if (bunbo > 0 && bunbo <= 12) {
      return `${bunshi}/${bunbo}`;
    }
  }

  return '';
}
