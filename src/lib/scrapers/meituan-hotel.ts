import { sanitizeHotelKeyword } from "../data/platform-urls";
import type { OtaScrapeContext, OtaScrapeResult } from "./types";
import { otaFetch } from "./http-fetch";
import { pickBestPriceForKeyword } from "./html-parse";

/** 美团酒店 H5 搜索页爬取 */
export async function scrapeMeituanHotel(
  hotelName: string,
  ctx: OtaScrapeContext,
): Promise<OtaScrapeResult | null> {
  const kw = sanitizeHotelKeyword(hotelName, ctx.cityName);
  const city = ctx.cityName.replace(/市$/g, "");
  const checkIn = ctx.checkIn ?? new Date().toISOString().split("T")[0];
  const url = `https://i.meituan.com/hotel/search?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(kw)}&startDay=${checkIn}`;

  const html = await otaFetch(url, {
    headers: {
      Referer: "https://i.meituan.com/",
      Accept: "text/html,application/json",
    },
  });
  if (!html) return null;

  const hit = pickBestPriceForKeyword(html, kw, true);
  if (!hit || hit.price <= 0) return null;

  return {
    price: hit.price,
    platform: "meituan",
    source: `美团爬取 ${checkIn} 起价`,
    scrapedAt: new Date().toISOString(),
    url,
    confidence: hit.title ? "high" : "medium",
    matchedTitle: hit.title,
    priceKind: "scraped",
  };
}
