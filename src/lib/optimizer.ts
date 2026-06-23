import type { Location, POI } from "./types";

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

/** 最近邻 TSP 启发式，优化单日游览顺序 */
export function optimizeRoute(pois: POI[]): POI[] {
  if (pois.length <= 1) return pois;

  const remaining = [...pois];
  const route: POI[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = route[route.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = distance(current, remaining[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    route.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return optimizeRoute2Opt(route);
}

/** 2-opt 路径改进：在最近邻结果上进一步缩短路程 */
export function optimizeRoute2Opt(pois: POI[]): POI[] {
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
        const before = distance(a, b) + (d ? distance(c, d) : 0);
        const after = distance(a, c) + (d ? distance(b, d) : 0);
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
