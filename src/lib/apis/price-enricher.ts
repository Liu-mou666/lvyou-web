import { fetchPOIDetail } from "./amap";
import { inferMarketPriceRange } from "../engine/price-intelligence";
import { applyPublicTicketHint } from "../engine/public-price-db";
import type { POI } from "../types";
import { storeGetSync, storeSetSync, CACHE_TTL } from "../cache/store";
import { cacheKey } from "../cache/memory";

/**
 * 零商业 API 价格增强管线：
 * 1. 高德详情 biz_ext.cost
 * 2. 公开窗口价库（5A/名景）
 * 3. 市场参考区间
 */
export async function enrichPriceFromSources(
  poi: POI,
  travelers = 2,
  cityName?: string,
): Promise<POI> {
  let next = { ...poi };

  const cacheId = cacheKey(["poi-price", next.id, String(travelers)]);
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
    } catch {
      /* continue pipeline */
    }
  }

  if (next.pricePerPerson <= 0 && next.type === "attraction") {
    next = applyPublicTicketHint(next, cityName);
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

  storeSetSync(cacheId, next, CACHE_TTL.poi);
  return next;
}
