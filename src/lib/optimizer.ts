import type { Location, POI } from "./types";
import type { PlanObjective } from "./engine/geo-cluster";
import { timeToMinutes } from "./realtime-engine";

/** Haversine 距离（km） */
export function distance(a: Location, b: Location): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function edgeCost(from: POI, to: POI, objective: PlanObjective): number {
  const d = distance(from, to);
  if (objective === "time") return d * 2 + (to.durationMinutes ?? 0) * 0.01;
  if (objective === "value") return d + (to.pricePerPerson ?? 0) * 0.08;
  return d - (to.compositeRating ?? to.rating) * 0.15;
}

function isOpenAtVisit(poi: POI, visitStartMinutes: number, durationMin: number): boolean {
  const open = timeToMinutes(poi.openTime);
  const close = timeToMinutes(poi.closeTime);
  const end = visitStartMinutes + durationMin;
  if (close < open) return visitStartMinutes >= open || end <= close + 24 * 60;
  return visitStartMinutes >= open && end <= close;
}

/** 最近邻 TSP，可选目标与起点 */
export function optimizeRouteNearest(
  pois: POI[],
  objective: PlanObjective = "experience",
  start?: POI,
): POI[] {
  if (pois.length <= 1) return pois;

  const remaining = [...pois];
  const route: POI[] = [];

  if (start && remaining.some((p) => p.id === start.id)) {
    const idx = remaining.findIndex((p) => p.id === start.id);
    route.push(remaining.splice(idx, 1)[0]);
  } else {
    // 体验优先从最高分开始，省时从中心开始
    if (objective === "experience") {
      remaining.sort((a, b) => (b.compositeRating ?? b.rating) - (a.compositeRating ?? a.rating));
    }
    route.push(remaining.shift()!);
  }

  while (remaining.length > 0) {
    const current = route[route.length - 1];
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = edgeCost(current, remaining[i], objective);
      if (c < bestCost) {
        bestCost = c;
        bestIdx = i;
      }
    }
    route.push(remaining.splice(bestIdx, 1)[0]);
  }

  return optimizeRoute2Opt(route, objective);
}

/** 2-opt 路径改进 */
export function optimizeRoute2Opt(pois: POI[], objective: PlanObjective = "experience"): POI[] {
  if (pois.length <= 3) return pois;

  const route = [...pois];
  let improved = true;
  let iterations = 0;
  const maxIter = pois.length * 4;

  while (improved && iterations < maxIter) {
    improved = false;
    iterations++;
    for (let i = 0; i < route.length - 2; i++) {
      for (let j = i + 2; j < route.length; j++) {
        const a = route[i];
        const b = route[i + 1];
        const c = route[j];
        const d = j + 1 < route.length ? route[j + 1] : null;
        const before = edgeCost(a, b, objective) + (d ? edgeCost(c, d, objective) : 0);
        const after = edgeCost(a, c, objective) + (d ? edgeCost(b, d, objective) : 0);
        if (after < before - 0.01) {
          const segment = route.slice(i + 1, j + 1).reverse();
          route.splice(i + 1, j - i, ...segment);
          improved = true;
        }
      }
    }
  }
  return route;
}

/** 带营业时间检查的插入启发式排序 */
export function optimizeRouteWithTimeWindows(
  pois: POI[],
  objective: PlanObjective = "experience",
  startMinutes = 9 * 60,
): POI[] {
  if (pois.length <= 1) return pois;

  const ordered = optimizeRouteNearest(pois, objective);
  const result: POI[] = [];
  const remaining = [...ordered];
  let currentMinutes = startMinutes;
  let last: POI | null = null;

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const travelMin = last ? Math.max(15, Math.round(distance(last, p) / 25 * 60)) : 0;
      const visitStart = currentMinutes + travelMin;
      const openOk = isOpenAtVisit(p, visitStart, p.durationMinutes);

      let score = edgeCost(last ?? p, p, objective);
      if (!openOk) score += 50;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    const travelMin = last ? Math.max(15, Math.round(distance(last, picked) / 25 * 60)) : 0;
    currentMinutes += travelMin + picked.durationMinutes;
    result.push(picked);
    last = picked;
  }

  return result.length > 0 ? optimizeRoute2Opt(result, objective) : ordered;
}

/** 最近邻 TSP 启发式（兼容旧接口） */
export function optimizeRoute(pois: POI[]): POI[] {
  return optimizeRouteNearest(pois, "experience");
}

export function totalRouteDistance(pois: POI[]): number {
  let total = 0;
  for (let i = 0; i < pois.length - 1; i++) {
    total += distance(pois[i], pois[i + 1]);
  }
  return Math.round(total * 10) / 10;
}

export function calcOptimizationScore(
  dailyDistances: number[],
  avgRating: number,
  weatherAdaptScore: number,
  avgRealtimeScore: number,
): number {
  const avgDist = dailyDistances.reduce((a, b) => a + b, 0) / dailyDistances.length;
  const distScore = Math.max(0, 100 - avgDist * 8);
  const ratingScore = (avgRating / 5) * 100;
  return Math.round(
    distScore * 0.25 + ratingScore * 0.25 + weatherAdaptScore * 0.2 + avgRealtimeScore * 0.3,
  );
}
