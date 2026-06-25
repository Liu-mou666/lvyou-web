import {
  ctripHotelMobileUrl,
  ctripHotelSearchUrl,
  getCtripCityId,
  sanitizeHotelKeyword,
} from "../data/platform-urls";
import type { OtaScrapeContext, OtaScrapeResult } from "./types";
import { otaFetch } from "./http-fetch";
import { pickBestPriceForKeyword, nameSimilarity } from "./html-parse";
import { interceptCtripPrices } from "./ctrip-api-intercept";
import { isPlaywrightAvailable, otaScrapeMode } from "./config";
import { resolveCtripCityId } from "./ctrip-city-index";
import { getCtripSession } from "./ctrip-session";
import { fetchCtripHotelsSoa, pickBestCtripHotel } from "./ctrip-soa-api";
import { searchCtripHotelInBrowser } from "./ctrip-browser-fetch";

function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function isWeakHit(title: string | undefined, keyword: string): boolean {
  if (!title) return true;
  if (title === "酒店" || title.length < 2) return true;
  return nameSimilarity(keyword, title) < 0.35;
}

async function resolveCityId(ctx: OtaScrapeContext): Promise<number | null> {
  if (ctx.adcode) {
    const staticId = getCtripCityId(ctx.adcode);
    if (staticId) return staticId;
  }
  return resolveCtripCityId(ctx.cityName);
}

/** 携程酒店：SOA 直连（session）→ Playwright 拦截 → HTML */
export async function scrapeCtripHotel(
  hotelName: string,
  ctx: OtaScrapeContext,
): Promise<OtaScrapeResult | null> {
  const checkIn = ctx.checkIn ?? new Date().toISOString().split("T")[0];
  const checkOut = ctx.checkOut ?? nextDay(checkIn);
  const cityId = await resolveCityId(ctx);
  const kw = sanitizeHotelKeyword(hotelName, ctx.cityName);

  // 1. 浏览器内 SOA（持久 Cookie，绕过 Node 直连缺 cticket）
  if (cityId) {
    const browserHit = await searchCtripHotelInBrowser(cityId, kw, checkIn, checkOut);
    if (browserHit && browserHit.price > 0 && !isWeakHit(browserHit.name, kw)) {
      const url = ctripHotelSearchUrl(ctx.cityName, kw, checkIn, checkOut, cityId);
      return {
        price: browserHit.price,
        platform: "ctrip",
        source: `携程 API ${checkIn} 起价`,
        scrapedAt: new Date().toISOString(),
        url,
        confidence: "high",
        matchedTitle: browserHit.name,
        priceKind: "scraped",
      };
    }
  }

  // 2. Node SOA（有完整 cticket 时更快）
  const session = await getCtripSession();
  if (session && cityId) {
    const hotels = await fetchCtripHotelsSoa(cityId, kw, checkIn, checkOut, session);
    const hit = pickBestCtripHotel(hotels, kw);
    if (hit && hit.price > 0 && !isWeakHit(hit.name, kw)) {
      const url = ctripHotelSearchUrl(ctx.cityName, kw, checkIn, checkOut, cityId);
      return {
        price: hit.price,
        platform: "ctrip",
        source: `携程 API ${checkIn} 起价`,
        scrapedAt: new Date().toISOString(),
        url,
        confidence: "high",
        matchedTitle: hit.name,
        priceKind: "scraped",
      };
    }
  }

  const urls = [
    ctripHotelMobileUrl(ctx.cityName, kw, checkIn, checkOut, cityId),
    ctripHotelSearchUrl(ctx.cityName, kw, checkIn, checkOut, cityId),
  ];

  const usePlaywright = otaScrapeMode() === "playwright" || (await isPlaywrightAvailable());

  for (const url of urls) {
    if (usePlaywright) {
      const intercepted = await interceptCtripPrices(url, kw, 6000);
      if (intercepted && intercepted.price > 0 && !isWeakHit(intercepted.title, kw)) {
        return {
          price: intercepted.price,
          platform: "ctrip",
          source: `携程爬取 ${checkIn} 起价`,
          scrapedAt: new Date().toISOString(),
          url,
          confidence: "high",
          matchedTitle: intercepted.title,
          priceKind: "scraped",
        };
      }
    }

    const html = await otaFetch(url);
    if (!html) continue;

    const hit = pickBestPriceForKeyword(html, kw, true);
    if (!hit || hit.price <= 0 || isWeakHit(hit.title, kw)) continue;

    return {
      price: hit.price,
      platform: "ctrip",
      source: `携程爬取 ${checkIn} 起价`,
      scrapedAt: new Date().toISOString(),
      url,
      confidence: hit.title ? "high" : "medium",
      matchedTitle: hit.title,
      priceKind: "scraped",
    };
  }

  return null;
}
