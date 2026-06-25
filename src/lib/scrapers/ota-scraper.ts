import type { POI } from "../types";
import { isOtaScrapeEnabled, otaScrapeMode } from "./config";
import { scrapeCtripHotel } from "./ctrip-hotel";
import { scrapeCtripTicket } from "./ctrip-ticket";
import { scrapeFliggyHotel } from "./fliggy-hotel";
import { scrapeMeituanHotel } from "./meituan-hotel";
import { scrapeAmapPrice } from "./amap-price";
import type { OtaScrapeContext, OtaScrapeResult } from "./types";
import { storeGetSync, storeSetSync } from "../cache/store";
import { cacheKey, CACHE_TTL } from "../cache/memory";

/**
 * 按 POI 类型爬取实价（个人自用）。
 * 爬不到就返回 null —— 禁止用参考价/价库冒充爬取结果。
 */
export async function scrapeOtaPrice(
  poi: POI,
  ctx: OtaScrapeContext,
): Promise<OtaScrapeResult | null> {
  if (!isOtaScrapeEnabled()) return null;

  const cacheId = cacheKey([
    "ota-scrape-v2",
    poi.type,
    poi.id || poi.name,
    ctx.checkIn ?? "",
    ctx.cityName,
  ]);
  const cached = storeGetSync<OtaScrapeResult>(cacheId);
  if (cached) return cached;

  let result: OtaScrapeResult | null = null;

  if (poi.type === "hotel") {
    // 携程 SOA/API 优先（需 session），其次美团/飞猪
    result = await scrapeCtripHotel(poi.name, ctx);
    if (!result) result = await scrapeMeituanHotel(poi.name, ctx);
    if (!result) result = await scrapeFliggyHotel(poi.name, ctx);
    // 高德 biz_ext 仅作补充（有官方收录价时）
    if (!result) result = await scrapeAmapPrice(poi.name, "hotel", ctx);
  } else if (poi.type === "attraction") {
    result = await scrapeCtripTicket(poi.name, ctx);
    if (!result) result = await scrapeAmapPrice(poi.name, "attraction", ctx);
  }

  if (result && result.priceKind === "scraped") {
    storeSetSync(cacheId, result, CACHE_TTL.poi);
  }
  return result;
}

export { isOtaScrapeEnabled, otaScrapeMode };
