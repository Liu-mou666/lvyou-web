/** 从 OTA 页面 HTML/JSON 文本中提取候选价格 */
export function extractPriceCandidates(text: string): number[] {
  const prices = new Set<number>();

  const patterns = [
    /"minPrice"\s*:\s*(\d+(?:\.\d+)?)/g,
    /"price"\s*:\s*(\d+(?:\.\d+)?)/g,
    /"salePrice"\s*:\s*(\d+(?:\.\d+)?)/g,
    /"lowestPrice"\s*:\s*(\d+(?:\.\d+)?)/g,
    /"displayPrice"\s*:\s*(\d+(?:\.\d+)?)/g,
    /data-price="(\d+(?:\.\d+)?)"/g,
    /¥\s*(\d{2,4})/g,
    /&yen;\s*(\d{2,4})/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = Math.round(parseFloat(m[1]));
      if (n >= 20 && n <= 8000) prices.add(n);
    }
  }

  return [...prices].sort((a, b) => a - b);
}

/** 提取页面中可能的酒店/景点标题，用于名称匹配 */
export function extractTitles(text: string): string[] {
  const titles = new Set<string>();
  const patterns = [
    /"hotelName"\s*:\s*"([^"]{2,40})"/g,
    /"name"\s*:\s*"([^"]{2,40})"/g,
    /"poiName"\s*:\s*"([^"]{2,40})"/g,
    /"scenicName"\s*:\s*"([^"]{2,40})"/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const t = m[1].replace(/\\u[\da-fA-F]{4}/g, "").trim();
      if (t.length >= 2) titles.add(t);
    }
  }
  return [...titles];
}

export function nameSimilarity(a: string, b: string): number {
  const x = a.replace(/\s/g, "").toLowerCase();
  const y = b.replace(/\s/g, "").toLowerCase();
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return 1;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  let hit = 0;
  for (let i = 0; i < short.length; i++) {
    if (long.includes(short[i])) hit++;
  }
  return hit / short.length;
}

export function pickBestPriceForKeyword(
  text: string,
  keyword: string,
  fallbackMin = true,
): { price: number; title?: string } | null {
  const prices = extractPriceCandidates(text);
  if (prices.length === 0) return null;

  const titles = extractTitles(text);
  if (titles.length > 0) {
    let best: { price: number; title: string; score: number } | null = null;
    for (const title of titles) {
      const score = nameSimilarity(keyword, title);
      if (score < 0.45) continue;
      const price = prices[0];
      if (!best || score > best.score) {
        best = { price, title, score };
      }
    }
    if (best) return { price: best.price, title: best.title };
  }

  const price = fallbackMin ? prices[0] : prices[prices.length - 1];
  return { price };
}
