import type { POI } from "../types";

export interface MarketPriceRange {
  low: number;
  high: number;
  label: string;
}

/** 无实时 API 时的公开市场参考区间（非 OTA 爬价，仅辅助决策） */
export function inferMarketPriceRange(poi: POI): MarketPriceRange | null {
  if (poi.pricePerPerson > 0) return null;
  if (poi.freeAttraction) return { low: 0, high: 0, label: "免费开放" };

  const name = poi.name;

  if (poi.type === "attraction") {
    if (poi.authorityTag) return { low: 60, high: 180, label: "5A/4A 景区常见" };
    if (/博物馆|纪念馆/.test(name)) return { low: 0, high: 50, label: "博物馆常见" };
    if (/步行街|老街|古镇|公园|湿地|绿道/.test(name)) return { low: 0, high: 30, label: "街区/公园常见" };
    if (/索道|游船|漂流/.test(name)) return { low: 80, high: 280, label: "体验项目常见" };
    return { low: 40, high: 120, label: "景区门票常见" };
  }

  if (poi.type === "hotel") {
    return { low: 120, high: 380, label: "经济型酒店常见" };
  }

  if (poi.type === "restaurant" || poi.type === "cafe") {
    return { low: 35, high: 120, label: "正餐人均常见" };
  }

  return null;
}

export function formatPriceLine(poi: POI, travelers = 2): string {
  if (poi.pricePerPerson > 0) {
    const unit = poi.type === "hotel" ? "/晚" : "/人";
    const total = poi.type === "hotel" ? poi.pricePerPerson : poi.pricePerPerson * travelers;
    const conf =
      poi.priceConfidence === "high"
        ? "高德收录"
        : poi.priceConfidence === "medium"
          ? "参考"
          : "估价";
    return `${conf} ¥${poi.pricePerPerson}${unit}${poi.type !== "hotel" ? ` · ${travelers}人约 ¥${total}` : ""}`;
  }
  const range = inferMarketPriceRange(poi);
  if (range && range.high === 0) return "预计免费";
  if (range) {
    const unit = poi.type === "hotel" ? "/晚" : "/人";
    return `市场参考 ¥${range.low}–${range.high}${unit}（${range.label}）`;
  }
  return "暂无价格 · 请下方一键查价";
}

export interface PriceAction {
  label: string;
  sublabel: string;
  url: string;
  platform: string;
}

/** 为每种 POI 挑「最可能看到实价」的首跳链接 */
export function pickPrimaryPriceAction(poi: POI, links: import("../types").PlatformLink[]): PriceAction | null {
  const byPlatform = (p: string) => links.filter((l) => l.platform === p);

  if (poi.type === "hotel") {
    const ctrip = links.find((l) => l.platform === "ctrip" && /房价|入住|searchWord|hotellist/.test(l.url + l.action));
    if (ctrip) return { label: "携程查当晚房价", sublabel: "精确搜该酒店", url: ctrip.url, platform: "ctrip" };
    const fliggy = links.find((l) => l.platform === "fliggy");
    if (fliggy) return { label: "飞猪查房价", sublabel: "当日实价", url: fliggy.url, platform: "fliggy" };
  }

  if (poi.type === "attraction") {
    const ticket = links.find(
      (l) =>
        (l.platform === "ctrip" && /门票|piao|ticket/.test(l.url + l.label + l.action)) ||
        l.platform === "fliggy",
    );
    if (ticket) {
      return {
        label: ticket.platform === "fliggy" ? "飞猪查门票" : "携程查门票",
        sublabel: "按景点名搜索",
        url: ticket.url,
        platform: ticket.platform,
      };
    }
    const amap = links.find((l) => l.platform === "amap" && l.action.includes("详情"));
    if (amap) return { label: "高德看详情", sublabel: "电话/营业时间/部分票价", url: amap.url, platform: "amap" };
  }

  if (poi.type === "restaurant" || poi.type === "cafe") {
    const dp = byPlatform("dianping")[0];
    if (dp) return { label: "点评看菜单价", sublabel: "用户评价+人均", url: dp.url, platform: "dianping" };
    const mt = byPlatform("meituan")[0];
    if (mt) return { label: "美团看团购", sublabel: "套餐/人均", url: mt.url, platform: "meituan" };
  }

  const first = links.find((l) => l.platform !== "amap" || l.action.includes("详情"));
  if (first) return { label: first.label, sublabel: first.action, url: first.url, platform: first.platform };

  return null;
}

export function pickCompareUrls(poi: POI, links: import("../types").PlatformLink[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const prefer =
    poi.type === "hotel"
      ? ["ctrip", "fliggy", "dianping"]
      : poi.type === "attraction"
        ? ["ctrip", "dianping", "amap"]
        : ["dianping", "meituan", "ctrip"];

  for (const p of prefer) {
    const link = links.find((l) => l.platform === p && !l.url.startsWith("tel:"));
    if (link && !seen.has(link.url)) {
      urls.push(link.url);
      seen.add(link.url);
    }
  }
  return urls.slice(0, 3);
}
