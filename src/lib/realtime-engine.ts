import type { Location, POI, RealtimeContext, RealtimeMetrics } from "./types";
import { authorityBonus } from "./data/authority-lists";
import { distance } from "./optimizer";

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isOpenAt(poi: POI, minutes: number): boolean {
  const open = timeToMinutes(poi.openTime);
  const close = timeToMinutes(poi.closeTime);
  if (close < open) return minutes >= open || minutes <= close;
  return minutes >= open && minutes <= close;
}

function valueRank(score: number): RealtimeMetrics["valueRank"] {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

/** 基于高德评分 + 权威名录 + 预算约束的综合打分（不模拟假人流） */
export function buildRealtimeMetrics(
  poi: POI,
  ctx: RealtimeContext,
  nearLocation?: Location,
  cityName?: string,
): RealtimeMetrics {
  const t = timeToMinutes(ctx.currentTime);
  const isOpen = isOpenAt(poi, t);
  const distKm = nearLocation ? distance(poi, nearLocation) : 0;
  const rating = poi.compositeRating ?? poi.rating;

  const reasons: string[] = [];
  let score = 0;

  const ratingScore = (rating / 5) * 100;
  const distScore = Math.max(0, 100 - distKm * 15);
  const valueScore = poi.valueScore ?? Math.round(rating * 18 - poi.pricePerPerson * 0.3);
  const authBonus = cityName ? authorityBonus(poi.name, cityName) : poi.authorityTag ? 20 : 0;

  let weatherScore = 100;
  if (ctx.weather.condition === "rainy") weatherScore = poi.indoor ? 100 : 35;

  if (ctx.priority === "value") {
    score += valueScore * 0.35 + ratingScore * 0.25 + distScore * 0.15 + weatherScore * 0.1 + authBonus * 0.15;
    if (valueScore >= 70) reasons.push("性价比高");
  } else if (ctx.priority === "time") {
    score += distScore * 0.4 + ratingScore * 0.25 + valueScore * 0.15 + weatherScore * 0.1 + authBonus * 0.1;
    if (distKm < 1.5) reasons.push(`${distKm.toFixed(1)}km 近`);
  } else {
    score += ratingScore * 0.35 + authBonus * 0.25 + valueScore * 0.15 + distScore * 0.15 + weatherScore * 0.1;
    if (rating >= 4.5) reasons.push("高评分");
  }

  if (poi.authorityTag) reasons.push(`文旅部 ${poi.authorityTag}`);
  reasons.push(`高德 ${poi.rating} 分`);
  if (poi.pricePerPerson > 0) reasons.push(`参考 ¥${poi.pricePerPerson}/人`);
  if (poi.priceNote) reasons.push(poi.priceNote);
  if (ctx.weather.condition === "rainy" && poi.indoor) reasons.push("雨天适宜");

  const budgetMax =
    ctx.maxMealBudget > 0 ? ctx.maxMealBudget : ctx.budget === "budget" ? 80 : ctx.budget === "moderate" ? 150 : 999;
  if (poi.pricePerPerson > budgetMax) {
    score *= 0.45;
    reasons.push("超预算");
  }
  if (ctx.totalBudget > 0 && poi.cost > 0) {
    const share = poi.cost / ctx.totalBudget;
    if (share > 0.12) {
      score *= Math.max(0.35, 1 - share * 2);
      reasons.push("占总预算比例偏高");
    }
  }
  if (!isOpen) {
    score = 0;
    reasons.push("当前未营业");
  }

  return {
    popularity: Math.min(100, Math.round(rating * 20)),
    isOpen,
    score: Math.round(Math.min(100, score)),
    scoreReasons: [...new Set(reasons)].slice(0, 6),
    dataTimestamp: new Date().toISOString(),
    dataSources: ["高德地图", poi.authorityTag ? "文旅部5A名录" : ""].filter(Boolean),
    valueRank: valueRank(valueScore),
    crowdAvailable: false,
  };
}

export function rankPOIs(
  pois: POI[],
  ctx: RealtimeContext,
  nearLocation?: Location,
  options?: { mealTime?: POI["mealTime"]; minScore?: number; limit?: number; cityName?: string },
): Array<{ poi: POI; realtime: RealtimeMetrics }> {
  const mealTime = options?.mealTime;
  const minScore = options?.minScore ?? 20;
  const limit = options?.limit ?? 10;

  return pois
    .filter((p) => {
      if (mealTime && p.mealTime && p.mealTime !== "any" && p.mealTime !== mealTime) return false;
      if (ctx.style !== "mixed" && p.type === "attraction" && p.category !== ctx.style && p.rating < 4.5) return false;
      return true;
    })
    .map((poi) => ({
      poi,
      realtime: buildRealtimeMetrics(poi, ctx, nearLocation, options?.cityName ?? ctx.city),
    }))
    .filter(({ realtime }) => realtime.isOpen && realtime.score >= minScore)
    .sort((a, b) => b.realtime.score - a.realtime.score)
    .slice(0, limit);
}

export function pickBest(
  pois: POI[],
  ctx: RealtimeContext,
  nearLocation?: Location,
  options?: { mealTime?: POI["mealTime"]; cityName?: string },
): { poi: POI; realtime: RealtimeMetrics } | null {
  return rankPOIs(pois, ctx, nearLocation, { ...options, limit: 1 })[0] ?? null;
}

export function crowdLabel(level: number): string {
  if (level <= 1) return "空闲";
  if (level <= 2) return "适中";
  if (level <= 3) return "较多";
  if (level <= 4) return "拥挤";
  return "爆满";
}

export function crowdColor(level: number): string {
  if (level <= 2) return "text-emerald-700 bg-emerald-50";
  if (level <= 3) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

export function valueRankLabel(rank?: RealtimeMetrics["valueRank"]): string {
  if (rank === "high") return "实惠优选";
  if (rank === "medium") return "性价比尚可";
  return "";
}
