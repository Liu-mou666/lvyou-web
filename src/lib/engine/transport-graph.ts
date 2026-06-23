import type { Evidence, PlatformLink } from "@/lib/types";
import {
  ctripTrainSearchUrl,
  fliggyTrainSearchUrl,
  link12306Search,
} from "../data/platform-urls";
import { haversineKm, resolveStation, type RailStation } from "../data/station-db";
import segments from "@/data/rail-segments.json";

export interface TransferHubOptions {
  priority?: "value" | "time" | "experience";
  totalBudget?: number;
  travelers?: number;
}

const CENTRAL_HUBS = new Set(["武汉", "汉口", "长沙", "长沙南", "郑州", "郑州东"]);
const EAST_HUBS = new Set(["上海虹桥", "上海", "杭州东", "南京南", "无锡东", "常州北", "合肥南"]);

type SegmentData = { hours: number; pricePerPerson: number; hsr?: boolean };
const SEGMENTS = segments as Record<string, SegmentData>;

function segKey(from: string, to: string): string {
  return `${from.replace(/站$/g, "")}|${to.replace(/站$/g, "")}`;
}

function stationAliases(name: string): string[] {
  const base = name.replace(/站$/g, "");
  const aliases = [base];
  if (base.endsWith("西") || base.endsWith("南") || base.endsWith("北")) {
    aliases.push(base.slice(0, -1));
  }
  if (base === "张家界") aliases.push("张家界西");
  if (base === "武汉") aliases.push("汉口");
  return aliases;
}

/** 查已知区段（双向 + 站名别名） */
export function lookupSegment(from: string, to: string): SegmentData | null {
  for (const f of stationAliases(from)) {
    for (const t of stationAliases(to)) {
      const hit = SEGMENTS[segKey(f, t)] ?? SEGMENTS[segKey(t, f)];
      if (hit) return hit;
    }
  }
  return null;
}

/** 铁路里程 ≈ 直线 × 1.35 */
export function railDistanceKm(haversineKm: number): number {
  return haversineKm * 1.35;
}

/** 高铁/动车运行时间（含停站），优先已知区段 */
export function realisticTrainHours(
  haversineKm: number,
  fromSt?: RailStation | null,
  toSt?: RailStation | null,
): number {
  if (fromSt && toSt) {
    const known = lookupSegment(fromSt.name, toSt.name);
    if (known) return known.hours;
  }

  if (haversineKm <= 0) return 0.5;
  const km = railDistanceKm(haversineKm);
  const fromTier = fromSt?.hubTier ?? 2;
  const toTier = toSt?.hubTier ?? 2;
  const minTier = Math.min(fromTier, toTier);

  // tier1↔tier1 高铁 ~260km/h；含山区/普速 ~100-180km/h
  let speed = 260;
  if (minTier >= 3) speed = 110;
  else if (minTier === 2 && Math.max(fromTier, toTier) >= 3) speed = 160;

  const cruise = km / speed;
  const stops = Math.floor(km / 500) * 0.2;
  return Math.max(0.5, Math.round((cruise + stops + 0.15) * 10) / 10);
}

export function trainPriceEstimate(
  haversineKm: number,
  travelers: number,
  fromSt?: RailStation | null,
  toSt?: RailStation | null,
): number {
  if (fromSt && toSt) {
    const known = lookupSegment(fromSt.name, toSt.name);
    if (known) return Math.round(known.pricePerPerson * travelers);
  }
  // 距离兜底：单段二等座 rarely > ¥450/人
  const perPerson = Math.min(450, Math.round(railDistanceKm(haversineKm) * 0.38));
  return perPerson * travelers;
}

export interface TransferCandidate {
  hub: RailStation;
  km1: number;
  km2: number;
  totalKm: number;
  detourRatio: number;
  score: number;
  estHours: number;
  estPrice: number;
}

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

const EAST_HUBS_SET = EAST_HUBS;

/** 中转枢纽：湘鄂→华东优先武汉/汉口（省钱+顺路）；省时优先上海虹桥 */
export function findTransferHubs(
  from: RailStation,
  to: RailStation,
  hubs: RailStation[],
  opts: TransferHubOptions = {},
): TransferCandidate[] {
  const priority = opts.priority ?? "value";
  const travelers = opts.travelers ?? 2;
  const tightBudget =
    (opts.totalBudget ?? 0) > 0 &&
    opts.totalBudget! / Math.max(travelers, 1) < 1200;
  const preferCentral = priority === "value" || tightBudget;

  const directKm = haversineKm(from, to);
  const candidates: TransferCandidate[] = [];

  for (const hub of hubs) {
    if (hub.telecode === from.telecode || hub.telecode === to.telecode) continue;
    if (from.name.includes(hub.name) || to.name.includes(hub.name)) continue;

    const km1 = haversineKm(from, hub);
    const km2 = haversineKm(hub, to);
    const totalKm = km1 + km2;
    const detourRatio = directKm > 0 ? totalKm / directKm : 999;

    if (km1 < 60 || km2 < 60) continue;
    if (detourRatio > 1.65) continue;

    const h1 = realisticTrainHours(km1, from, hub);
    const h2 = realisticTrainHours(km2, hub, to);
    const transferMin = hub.name.includes("虹桥") ? 35 : hub.name.includes("上海") ? 40 : 45;
    const estHours = h1 + h2 + transferMin / 60;
    const estPrice =
      trainPriceEstimate(km1, travelers, from, hub) +
      trainPriceEstimate(km2, travelers, hub, to);

    let score = 100 - (detourRatio - 1) * 80 - estHours * 1.5 - estPrice * 0.02;
    score += (3 - hub.hubTier) * 6;

    const fromCentral = from.region === "central";
    const toEast = to.region === "east";

    if (fromCentral && toEast) {
      if (CENTRAL_HUBS.has(hub.name)) score += preferCentral ? 55 : 25;
      if (EAST_HUBS_SET.has(hub.name)) score += preferCentral ? -10 : 45;
      if (hub.name === "上海虹桥" && preferCentral) score -= 25;
    } else if (toEast && EAST_HUBS_SET.has(hub.name)) {
      score += priority === "time" ? 40 : 15;
    }

    candidates.push({ hub, km1, km2, totalKm, detourRatio, score, estHours, estPrice });
  }

  return candidates
    .sort((a, b) => (preferCentral ? b.score - a.score : b.score - a.score))
    .slice(0, 6);
}

export function buildTransferEvidence(
  fromName: string,
  toName: string,
  hub: RailStation,
  km1: number,
  km2: number,
): Evidence {
  const fromSt = resolveStation(fromName);
  const toSt = resolveStation(toName);
  const directKm = fromSt && toSt ? haversineKm(fromSt, toSt) : km1 + km2;
  const detourPct = directKm > 0 ? Math.round(((km1 + km2) / directKm - 1) * 100) : 0;

  return {
    claim: `经 ${hub.name} 中转（绕路约 ${detourPct}%）`,
    sources: [
      {
        name: "全国铁路枢纽站码库",
        value: `${fromName} → ${hub.name}(${Math.round(km1)}km) → ${toName}(${Math.round(km2)}km)`,
        fetchedAt: new Date().toISOString(),
      },
      {
        name: "铁路路径参考",
        value: hub.name === "武汉" || hub.name === "汉口"
          ? "湘鄂→华东经典经武汉/汉口中转，票价通常低于绕上海"
          : "华东方向也可经上海虹桥/杭州东，偏省时",
        fetchedAt: new Date().toISOString(),
      },
    ],
    confidence: "high",
    alternatives: ["武汉", "汉口", "上海虹桥", "长沙南"].filter((h) => h !== hub.name),
  };
}

export function buildTrainBookingLinks(
  fromStation: string,
  toStation: string,
  date: string,
  fromSt?: RailStation | null,
  toSt?: RailStation | null,
) {
  const from = fromSt?.name ?? fromStation;
  const to = toSt?.name ?? toStation;
  const links = [
    { platform: "ctrip" as const, label: "携程", action: "查车次·中转", url: ctripTrainSearchUrl(from, to, date) },
    { platform: "fliggy" as const, label: "飞猪", action: "查车次", url: fliggyTrainSearchUrl(from, to, date) },
  ];
  if (fromSt && toSt) {
    links.push({
      platform: "fliggy" as const,
      label: "12306",
      action: "官网查票",
      url: link12306Search(fromSt.name, fromSt.telecode, toSt.name, toSt.telecode, date),
    });
  }
  return links;
}

/** 单段火车票链接（中转每段独立可查） */
export function buildLegBookingLinks(
  fromSt: RailStation,
  toSt: RailStation,
  date: string,
  legLabel: string,
): PlatformLink[] {
  return [
    {
      platform: "ctrip" as const,
      label: "携程",
      action: `${legLabel} ${fromSt.name}→${toSt.name}`,
      url: ctripTrainSearchUrl(fromSt.name, toSt.name, date),
    },
    {
      platform: "fliggy" as const,
      label: "12306",
      action: `${legLabel} 官网查票`,
      url: link12306Search(fromSt.name, fromSt.telecode, toSt.name, toSt.telecode, date),
    },
  ];
}
