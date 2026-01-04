// src/textExtract.js
// 本文テキストから「補助率」「上限額」「対象」をできるだけきれいに抜き出すユーティリティ

// 全角数字 → 半角数字
function z2hNumber(str) {
  const z = '０１２３４５６７８９';
  const h = '0123456789';
  return str.replace(/[０-９]/g, (ch) => h[z.indexOf(ch)]);
}

// テキスト正規化（空白整理・全角記号の一部を半角に）
function normalize(text) {
  if (!text) return '';
  let s = text;
  s = z2hNumber(s);
  s = s.replace(/\r/g, '');
  s = s.replace(/　/g, ' ');
  s = s.replace(/％/g, '%');
  s = s.replace(/／/g, '/');
  s = s.replace(/～/g, '~');
  // 連続スペースを 1 個に
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

// 「。」と改行でざっくり文に分割
function splitSentences(text) {
  return text
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 補助率の文から「3分の2以内」「1/2以内」「70%以内」などだけを抜き出す
function pickRatePhrase(sentence) {
  const s = sentence;

  const patterns = [
    // 補助率: 3分の2以内 / 補助率 1/2以内
    /補助率[：:は]*\s*((?:\d+\/\d+|\d+分の\d+)\s*以内)/,
    // 補助率: 70%以内 / 補助率7/10以内 など
    /補助率[：:は]*\s*([\d.]+\/\d+\s*以内)/,
    /補助率[：:は]*\s*([\d.]+%?\s*以内)/,
    // 「〜以内」が文頭に来ているケース
    /((?:\d+\/\d+|\d+分の\d+)\s*以内)/,
    /([\d.]+%?\s*以内)/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) {
      return m[1].trim();
    }
  }
  return '';
}

// 上限額の文から「100万円」「560万円」「25万円」などだけを抜き出す
function pickLimitPhrase(sentence) {
  const s = sentence;

  const patterns = [
    // 上限額: 100万円 / 上限: 560万円
    /上限額?[：:は]*\s*([\d,]+万円)/,
    // 「上限額100万円」みたいにくっついているケース
    /上限額?[\s　]*([\d,]+万円)/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  // どうしても取れない場合は、その文の中で一番大きそうな「〜万円」を拾う
  const yenMatches = [...s.matchAll(/([\d,]+)万円/g)].map((m) => m[0]);
  if (yenMatches.length > 0) {
    // とりあえず先頭を返す（必要なら最大値にする運用もあり）
    return yenMatches[0];
  }

  return '';
}

// ==============================
// 公開関数: 補助率
// ==============================
export function extractRate(rawText) {
  const text = normalize(rawText);
  if (!text) return '';

  const sentences = splitSentences(text);

  // まず「補助率」を含む文から探す
  for (const s of sentences) {
    if (!s.includes('補助率')) continue;
    const rate = pickRatePhrase(s);
    if (rate) {
      // 変に長くならないように安全側でカット
      return rate.length > 30 ? rate.slice(0, 30) : rate;
    }
  }

  // どうしても見つからなければ全文から最後のあがき
  const fallback = pickRatePhrase(text);
  return fallback.length > 30 ? fallback.slice(0, 30) : fallback;
}

// ==============================
// 公開関数: 上限額
// ==============================
export function extractLimit(rawText) {
  const text = normalize(rawText);
  if (!text) return '';

  const sentences = splitSentences(text);

  // 「上限」「上限額」を含む文を優先
  for (const s of sentences) {
    if (!s.includes('上限')) continue;
    const limit = pickLimitPhrase(s);
    if (limit) {
      return limit.length > 30 ? limit.slice(0, 30) : limit;
    }
  }

  // どうしても見つからないときは全文から
  const fallback = pickLimitPhrase(text);
  return fallback.length > 30 ? fallback.slice(0, 30) : fallback;
}

// ==============================
// 公開関数: 対象
// ==============================
export function extractTarget(rawText) {
  const text = normalize(rawText);
  if (!text) return '';

  const sentences = splitSentences(text);

  const picked = [];

  for (const s of sentences) {
    // 「対象外」はぜんぶ捨てる
    if (s.includes('対象外')) continue;

    // 対象者／補助対象 らしい文だけ拾う
    if (s.match(/対象者|補助対象|対象となる/)) {
      picked.push(s.trim());
    }

    // 文字数が増えすぎないように 200 文字くらいで打ち切る
    if (picked.join('／').length > 200) break;
  }

  const result = picked.join('／');
  return result.length > 400 ? result.slice(0, 400) : result;
}
