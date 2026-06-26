import type { POI, TrainRoute } from "./types";

export type PriceTruthSource =
  | "scraped"
  | "amap"
  | "public_db"
  | "market_estimate"
  | "juhe"
  | "reference"
  | "none";

export type PriceTruthConfidence = "high" | "medium" | "low" | "none";

export interface PriceTruth {
  amount: number;
  unit: "per_person" | "per_night" | "total";
  source: PriceTruthSource;
  confidence: PriceTruthConfidence;
  label: string;
  fetchedAt?: string;
  verifyUrl?: string;
}

const SOURCE_LABEL: Record<PriceTruthSource, string> = {
  scraped: "携程实爬",
  amap: "高德收录",
  public_db: "指导价",
  market_estimate: "市场参考",
  juhe: "12306",
  reference: "铁路参考",
  none: "待查价",
};

const CONF_BADGE: Record<PriceTruthConfidence, string> = {
  high: "source-badge-high",
  medium: "source-badge-medium",
  low: "source-badge-low",
  none: "source-badge-none",
};

export function priceTruthBadgeClass(confidence: PriceTruthConfidence): string {
  return CONF_BADGE[confidence] ?? CONF_BADGE.none;
}

export function priceTruthSourceLabel(source: PriceTruthSource): string {
  return SOURCE_LABEL[source] ?? source;
}

export function formatPriceTruth(truth: PriceTruth): string {
  if (truth.amount <= 0) return "待查价";
  const suffix =
    truth.unit === "per_night" ? "/晚" : truth.unit === "total" ? "" : "/人";
  return `¥${truth.amount}${suffix}`;
}

function inferSourceFromNote(note?: string): PriceTruthSource {
  if (!note) return "none";
  if (/携程|爬取|实价/.test(note)) return "scraped";
  if (/高德/.test(note)) return "amap";
  if (/指导价|5A|名景|淡季|旺季/.test(note)) return "public_db";
  if (/市场参考|参考价/.test(note)) return "market_estimate";
  if (/12306/.test(note)) return "juhe";
  if (/铁路|区段/.test(note)) return "reference";
  return "none";
}

export function poiToPriceTruth(poi: POI, travelers = 2): PriceTruth {
  if (poi.priceTruth) return poi.priceTruth;

  const unit: PriceTruth["unit"] =
    poi.type === "hotel" ? "per_night" : poi.type === "attraction" ? "per_person" : "per_person";
  const confidence = poi.priceConfidence ?? (poi.pricePerPerson > 0 ? "medium" : "none");
  const source = inferSourceFromNote(poi.priceNote);
  const link = poi.links?.find((l) => l.platform === "ctrip" || l.platform === "xiecheng");

  return {
    amount: poi.pricePerPerson,
    unit,
    source,
    confidence,
    label: poi.priceNote ?? (poi.pricePerPerson > 0 ? formatPriceTruth({ amount: poi.pricePerPerson, unit, source, confidence, label: "" }) : "待查价"),
    verifyUrl: link?.url,
  };
}

export function trainToPriceTruth(route: TrainRoute): PriceTruth {
  const hasJuhe = route.dataSource?.includes("12306") || route.verified;
  return {
    amount: route.totalPrice,
    unit: "total",
    source: hasJuhe ? "juhe" : route.totalPrice > 0 ? "reference" : "none",
    confidence: route.verified ? "high" : route.totalPrice > 0 ? "medium" : "none",
    label: route.priceNote ?? (route.totalPrice > 0 ? `¥${route.totalPrice}（${route.title}）` : "请链接查实价"),
    verifyUrl: route.bookingUrl || route.links?.[0]?.url,
    fetchedAt: route.verifiedAt,
  };
}

export function attachPriceTruth(poi: POI, travelers = 2): POI {
  const truth = poiToPriceTruth(poi, travelers);
  return { ...poi, priceTruth: truth };
}

export function mergePriceTruthFromEnrich(
  poi: POI,
  travelers: number,
): POI {
  const unit: PriceTruth["unit"] = poi.type === "hotel" ? "per_night" : "per_person";
  let source: PriceTruthSource = "none";
  const note = poi.priceNote ?? "";

  if (/携程|爬取|实价/.test(note)) source = "scraped";
  else if (/高德/.test(note)) source = "amap";
  else if (/指导价|5A|名景/.test(note)) source = "public_db";
  else if (/市场参考/.test(note)) source = "market_estimate";
  else if (poi.pricePerPerson > 0) source = "amap";

  const link = poi.links?.find((l) => /ctrip|xiecheng/i.test(l.platform));

  const truth: PriceTruth = {
    amount: poi.pricePerPerson,
    unit,
    source,
    confidence: poi.priceConfidence ?? (poi.pricePerPerson > 0 ? "medium" : "none"),
    label: note || (poi.pricePerPerson > 0 ? `¥${poi.pricePerPerson}` : "待查价"),
    verifyUrl: link?.url,
    fetchedAt: new Date().toISOString(),
  };

  return { ...poi, priceTruth: truth };
}
