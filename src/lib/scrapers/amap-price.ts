import { getAmapKey } from "../config";
import { sanitizeHotelKeyword, sanitizeSightKeyword } from "../data/platform-urls";
import type { OtaScrapeContext, OtaScrapeResult } from "./types";
import { searchPOI, fetchPOIDetail } from "../apis/amap";

/** 高德酒店/景点详情价（有 Key 时最稳，无验证码） */
export async function scrapeAmapPrice(
  name: string,
  type: "hotel" | "attraction",
  ctx: OtaScrapeContext,
): Promise<OtaScrapeResult | null> {
  try {
    getAmapKey();
  } catch {
    return null;
  }

  const kw =
    type === "hotel"
      ? sanitizeHotelKeyword(name, ctx.cityName)
      : sanitizeSightKeyword(name, ctx.cityName);

  const results = await searchPOI({
    keywords: `${ctx.cityName} ${kw}`,
    city: ctx.cityName,
    types: type === "hotel" ? "100000" : "110000",
    offset: 8,
  });

  let bestId: string | null = null;
  let bestScore = 0;
  for (const p of results) {
    if (!p.name || !p.id) continue;
    const score = p.name.includes(kw) || kw.includes(p.name.replace(/酒店|景区/g, "")) ? 1 : 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestId = p.id;
    }
  }
  if (!bestId && results[0]?.id) bestId = results[0].id;
  if (!bestId) return null;

  const detail = await fetchPOIDetail(bestId);
  const cost = parseFloat(detail?.biz_ext?.cost ?? "0") || 0;
  if (cost <= 0) return null;

  return {
    price: Math.round(cost),
    platform: "amap",
    source: "高德 POI 收录价",
    scrapedAt: new Date().toISOString(),
    url: `https://www.amap.com/place/${bestId}`,
    confidence: "high",
    matchedTitle: detail?.name ?? name,
    priceKind: "scraped",
  };
}
