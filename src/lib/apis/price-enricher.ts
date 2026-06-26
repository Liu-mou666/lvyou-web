import { fetchPOIDetail } from "./amap";
import { inferMarketPriceRange } from "../engine/price-intelligence";
import { applyPublicTicketHint } from "../engine/public-price-db";
import { scrapeOtaPrice, isOtaScrapeEnabled } from "../scrapers/ota-scraper";
import { mergePriceTruthFromEnrich } from "../price-truth";
import type { POI } from "../types";
import { storeGetSync, storeSetSync, CACHE_TTL } from "../cache/store";
import { cacheKey } from "../cache/memory";

export interface PriceEnrichOpts {
  checkIn?: string;
  adcode?: string;
  cityName?: string;
}

/**
 * 价格增强管线：
 * 1. 高德详情 biz_ext.cost
 * 2. OTA 真爬（ENABLE_OTA_SCRAPE=true，个人自用）
 * 3. 公开窗口价库（5A/名景）
 * 4. 市场参考区间
 */
export async function enrichPriceFromSources(
  poi: POI,
  travelers = 2,
  cityName?: string,
  opts?: PriceEnrichOpts,
): Promise<POI> {
  let next = { ...poi };
  const resolvedCity = cityName ?? opts?.cityName;

  const cacheId = cacheKey(["poi-price", next.id, String(travelers), opts?.checkIn ?? "", isOtaScrapeEnabled() ? "ota" : ""]);
  const cached = storeGetSync<POI>(cacheId);
  if (cached && cached.priceConfidence) {
    return cached;
  }

  if (next.pricePerPerson <= 0 && next.id && !next.id.startsWith("must-")) {
    try {
      const detail = await fetchPOIDetail(next.id);
      const cost = parseFloat(detail?.biz_ext?.cost ?? "0") || 0;
      if (cost > 0) {
        next = {
          ...next,
          pricePerPerson: cost,
          cost: next.type === "hotel" ? Math.round(cost) : Math.round(cost * travelers),
          priceConfidence: "high",
          priceNote: `高德详情收录 ¥${cost}${next.type === "hotel" ? "/晚" : "/人"}`,
        };
      }
      const photos = (detail?.photos ?? []).map((p) => p.url).filter(Boolean).slice(0, 4);
      if (photos.length > 0 && (!next.photoUrls || next.photoUrls.length < 2)) {
        next = { ...next, photoUrl: photos[0], photoUrls: photos };
      }
      if (detail?.tel && !next.tel) {
        next = { ...next, tel: String(detail.tel) };
      }
    } catch {
      /* continue pipeline */
    }
  }

  // OTA 真爬：酒店/门票优先用携程页面实价（需 ENABLE_OTA_SCRAPE=true）
  const shouldScrapeOta =
    isOtaScrapeEnabled() &&
    resolvedCity &&
    (next.type === "hotel" || next.type === "attraction") &&
    (next.pricePerPerson <= 0 || next.priceConfidence === "low" || next.priceConfidence === "none");

  if (shouldScrapeOta) {
    try {
      const ota = await scrapeOtaPrice(next, {
        cityName: resolvedCity,
        adcode: opts?.adcode,
        checkIn: opts?.checkIn,
        travelers,
      });
      if (ota && ota.price > 0 && ota.priceKind === "scraped") {
        const unit = next.type === "hotel" ? "/晚" : "/人";
        const platformLabel =
          ota.platform === "ctrip"
            ? "携程"
            : ota.platform === "fliggy"
              ? "飞猪"
              : ota.platform === "meituan"
                ? "美团"
                : "高德";
        next = {
          ...next,
          pricePerPerson: ota.price,
          cost: next.type === "hotel" ? ota.price : Math.round(ota.price * travelers),
          priceConfidence: ota.confidence,
          priceNote: `${platformLabel}实价 ¥${ota.price}${unit}（${ota.source}）`,
          source: `${next.source ?? "高德地图"} + ${platformLabel}爬取`,
        };
      }
    } catch {
      /* 爬取失败不阻断 */
    }
  }

  if (next.pricePerPerson <= 0 && next.type === "attraction") {
    next = applyPublicTicketHint(next, cityName, opts?.checkIn);
    if (next.pricePerPerson > 0) {
      next.cost = Math.round(next.pricePerPerson * travelers);
    }
  }

  if (next.pricePerPerson <= 0) {
    const range = inferMarketPriceRange(next);
    if (range) {
      const unit = next.type === "hotel" ? "/晚" : "/人";
      if (range.high === 0) {
        next = {
          ...next,
          freeAttraction: true,
          priceConfidence: "medium",
          priceNote: range.label,
        };
      } else {
        next = {
          ...next,
          priceConfidence: "low",
          priceNote: `市场参考 ¥${range.low}–${range.high}${unit}（${range.label}）· 点下方按钮查平台实价`,
        };
      }
    }
  }

  if (next.pricePerPerson > 0 && next.type !== "hotel" && next.cost <= 0) {
    next.cost = Math.round(next.pricePerPerson * travelers);
  }

  next = mergePriceTruthFromEnrich(next, travelers);
  storeSetSync(cacheId, next, CACHE_TTL.poi);
  return next;
}
