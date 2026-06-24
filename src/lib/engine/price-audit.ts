import type { Evidence, Itinerary, POI, PriceAudit, PriceAuditItem } from "../types";

export function auditItineraryPrices(itinerary: Itinerary): PriceAudit {
  const pois = collectPois(itinerary);
  let high = 0;
  let medium = 0;
  let low = 0;
  let none = 0;
  const needCheck: PriceAuditItem[] = [];

  for (const { poi, day } of pois) {
    const conf = poi.priceConfidence ?? (poi.pricePerPerson > 0 ? "high" : "none");
    if (conf === "high") high++;
    else if (conf === "medium") medium++;
    else if (conf === "low") low++;
    else none++;

    if (conf === "none" || conf === "low") {
      const primary = poi.links?.find((l) => !l.url.startsWith("tel:"));
      needCheck.push({
        poiId: poi.id,
        poiName: poi.name,
        type: poi.type,
        day,
        confidence: conf,
        pricePerPerson: poi.pricePerPerson,
        checkUrl: primary?.url,
      });
    }
  }

  const total = pois.length;
  const verifiedPercent = total > 0 ? Math.round(((high + medium) / total) * 100) : 0;

  const tips: string[] = [];
  if (none > 0) tips.push(`${none} 项暂无数字价，已附一键查价链接，建议出发前点链接确认`);
  if (low > 0) tips.push(`${low} 项为市场参考区间，非实时 OTA 价`);
  if (high > 0) tips.push(`${high} 项来自高德收录，可信度较高`);
  if (itinerary.trainRoutes?.some((r) => r.verified)) tips.push("去程火车含 12306/API 验证票价");

  const summary = `价格可信度 ${verifiedPercent}%（高德/公开参考 ${high + medium}/${total}）`;

  return {
    totalPois: total,
    high,
    medium,
    low,
    none,
    verifiedPercent,
    needCheck: needCheck.slice(0, 20),
    summary,
    tips,
  };
}

export function buildPriceAuditEvidence(audit: PriceAudit): Evidence[] {
  return [
    {
      claim: audit.summary,
      confidence: audit.verifiedPercent >= 70 ? "high" : audit.verifiedPercent >= 40 ? "medium" : "low",
      sources: audit.tips.map((t, i) => ({
        name: `说明${i + 1}`,
        value: t,
        fetchedAt: new Date().toISOString(),
      })),
    },
  ];
}

function collectPois(itinerary: Itinerary): Array<{ poi: POI; day?: number }> {
  const out: Array<{ poi: POI; day?: number }> = [];
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (item.poi) out.push({ poi: item.poi, day: day.day });
    }
    if (day.hotel) out.push({ poi: day.hotel, day: day.day });
  }
  return out;
}
