import { ctripTicketSearchUrl, getCtripCityId, sanitizeSightKeyword } from "../data/platform-urls";
import type { OtaScrapeContext, OtaScrapeResult } from "./types";
import { otaFetch } from "./http-fetch";
import { pickBestPriceForKeyword, nameSimilarity } from "./html-parse";
import { interceptCtripPrices } from "./ctrip-api-intercept";
import { isPlaywrightAvailable, otaScrapeMode } from "./config";
import { resolveCtripCityId } from "./ctrip-city-index";
import { getCtripSession } from "./ctrip-session";
import { fetchCtripTicketsSoa } from "./ctrip-soa-api";

async function resolveCityId(ctx: OtaScrapeContext): Promise<number | null> {
  if (ctx.adcode) {
    const staticId = getCtripCityId(ctx.adcode);
    if (staticId) return staticId;
  }
  return resolveCtripCityId(ctx.cityName);
}

/** 携程门票：SOA → Playwright 拦截 → HTML */
export async function scrapeCtripTicket(
  sightName: string,
  ctx: OtaScrapeContext,
): Promise<OtaScrapeResult | null> {
  const cityId = await resolveCityId(ctx);
  const kw = sanitizeSightKeyword(sightName, ctx.cityName);
  const url = ctripTicketSearchUrl(ctx.cityName, kw, cityId);

  const session = await getCtripSession();
  if (session && cityId) {
    const tickets = await fetchCtripTicketsSoa(cityId, kw, session);
    let best: { name: string; price: number } | null = null;
    let bestScore = 0;
    for (const t of tickets) {
      const score = nameSimilarity(kw, t.name);
      if (score > bestScore && t.price > 0) {
        bestScore = score;
        best = t;
      }
    }
    if (best && bestScore >= 0.3) {
      return {
        price: best.price,
        platform: "ctrip",
        source: "携程门票 API 起价",
        scrapedAt: new Date().toISOString(),
        url,
        confidence: "high",
        matchedTitle: best.name,
        priceKind: "scraped",
      };
    }
  }

  const usePlaywright = otaScrapeMode() === "playwright" || (await isPlaywrightAvailable());

  if (usePlaywright) {
    const intercepted = await interceptCtripPrices(url, kw, 7000);
    if (intercepted && intercepted.price > 0) {
      return {
        price: intercepted.price,
        platform: "ctrip",
        source: "携程门票爬取起价",
        scrapedAt: new Date().toISOString(),
        url,
        confidence: intercepted.title ? "high" : "medium",
        matchedTitle: intercepted.title,
        priceKind: "scraped",
      };
    }
  }

  const html = await otaFetch(url);
  if (!html) return null;

  const hit = pickBestPriceForKeyword(html, kw, true);
  if (!hit || hit.price <= 0) return null;

  return {
    price: hit.price,
    platform: "ctrip",
    source: "携程门票爬取起价",
    scrapedAt: new Date().toISOString(),
    url,
    confidence: hit.title ? "high" : "medium",
    matchedTitle: hit.title,
    priceKind: "scraped",
  };
}
