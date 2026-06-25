import { fliggyHotelSearchUrl, sanitizeHotelKeyword } from "../data/platform-urls";
import type { OtaScrapeContext, OtaScrapeResult } from "./types";
import { otaFetch } from "./http-fetch";
import { pickBestPriceForKeyword } from "./html-parse";

/** 飞猪酒店搜索页真爬（携程失败时兜底） */
export async function scrapeFliggyHotel(
  hotelName: string,
  ctx: OtaScrapeContext,
): Promise<OtaScrapeResult | null> {
  const checkIn = ctx.checkIn ?? new Date().toISOString().split("T")[0];
  const kw = sanitizeHotelKeyword(hotelName, ctx.cityName);
  const url = fliggyHotelSearchUrl(ctx.cityName, kw, checkIn);

  const html = await otaFetch(url, {
    headers: { Referer: "https://www.fliggy.com/" },
  });
  if (!html) return null;

  const hit = pickBestPriceForKeyword(html, kw, true);
  if (!hit || hit.price <= 0) return null;

  return {
    price: hit.price,
    platform: "fliggy",
    source: `飞猪爬取 ${checkIn} 起价`,
    scrapedAt: new Date().toISOString(),
    url,
    confidence: hit.title ? "high" : "medium",
    matchedTitle: hit.title,
    priceKind: "scraped",
  };
}
