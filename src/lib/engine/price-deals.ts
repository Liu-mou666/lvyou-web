import type { POI, PlatformLink, DealInfo } from "../types";
import { pickPrimaryPriceAction } from "../engine/price-intelligence";

/** 把深链包装成「查价入口」，不编造折扣数字 */
export function buildPriceCheckDeals(poi: POI, links: PlatformLink[]): DealInfo[] {
  const deals: DealInfo[] = [];
  const primary = pickPrimaryPriceAction(poi, links);

  if (primary) {
    deals.push({
      platform: primary.platform === "ctrip" ? "携程" : primary.platform === "dianping" ? "大众点评" : primary.platform,
      dealPrice: 0,
      label: primary.label,
      url: primary.url,
      originalPrice: poi.pricePerPerson > 0 ? poi.pricePerPerson : undefined,
    });
  }

  if (poi.type === "restaurant" || poi.type === "cafe") {
    const mt = links.find((l) => l.platform === "meituan");
    if (mt && mt.url !== primary?.url) {
      deals.push({
        platform: "美团",
        dealPrice: 0,
        label: "看团购套餐",
        url: mt.url,
      });
    }
  }

  if (poi.type === "hotel") {
    const fliggy = links.find((l) => l.platform === "fliggy");
    if (fliggy && fliggy.url !== primary?.url) {
      deals.push({
        platform: "飞猪",
        dealPrice: 0,
        label: "查当日房价",
        url: fliggy.url,
      });
    }
  }

  return deals.slice(0, 3);
}
