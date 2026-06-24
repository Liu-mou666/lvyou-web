import type { POI } from "../types";
import { distance } from "../optimizer";

export type PlanObjective = "value" | "time" | "experience";

/** K-Means 聚类（景点坐标） */
function kMeans(points: POI[], k: number, maxIter = 25): POI[][] {
  if (points.length === 0) return [];
  if (k >= points.length) return points.map((p) => [p]);

  const valid = points.filter((p) => p.lat && p.lng);
  if (valid.length === 0) return [points];

  let centroids = valid.slice(0, k).map((p) => ({ lat: p.lat, lng: p.lng }));
  let clusters: POI[][] = Array.from({ length: k }, () => []);

  for (let iter = 0; iter < maxIter; iter++) {
    clusters = Array.from({ length: k }, () => []);
    for (const p of valid) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distance(p, centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      clusters[best].push(p);
    }
    const newCentroids = clusters.map((cluster, i) => {
      if (cluster.length === 0) return centroids[i];
      const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
      return { lat, lng };
    });
    if (newCentroids.every((c, i) => distance(c, centroids[i]) < 0.001)) break;
    centroids = newCentroids;
  }

  // 无坐标 POI 放入第一个簇
  const noCoord = points.filter((p) => !p.lat || !p.lng);
  if (noCoord.length && clusters[0]) clusters[0].push(...noCoord);

  return clusters.filter((c) => c.length > 0);
}

function sortClusterByObjective(cluster: POI[], objective: PlanObjective): POI[] {
  if (objective === "experience") {
    return [...cluster].sort((a, b) => (b.compositeRating ?? b.rating) - (a.compositeRating ?? a.rating));
  }
  if (objective === "value") {
    return [...cluster].sort((a, b) => a.pricePerPerson - b.pricePerPerson || b.rating - a.rating);
  }
  return cluster;
}

/**
 * 地理聚类后分配到各天，替代纯顺序切片
 */
export function clusterDistributeAttractions(
  pool: POI[],
  days: number,
  perDay: number,
  objective: PlanObjective = "experience",
): POI[][] {
  const used = new Set<string>();
  const unique = pool.filter((p) => {
    const key = p.id || p.name;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });

  if (unique.length === 0) return Array.from({ length: days }, () => []);

  const clusters = kMeans(unique, days);
  const sortedClusters = clusters.map((c) => sortClusterByObjective(c, objective));

  // 平衡簇大小到 perDay
  const result: POI[][] = Array.from({ length: days }, () => []);
  const flat: POI[] = [];

  sortedClusters.forEach((cluster, ci) => {
    const dayIdx = Math.min(ci, days - 1);
    const take = cluster.slice(0, perDay);
    result[dayIdx].push(...take);
    flat.push(...take);
    const rest = cluster.slice(perDay);
    flat.push(...rest);
  });

  // 未分配景点按 objective 填充
  let rest = unique.filter((p) => !flat.some((f) => f.id === p.id && f.name === p.name));
  rest = sortClusterByObjective(rest, objective);

  for (const p of rest) {
    const dayWithRoom = result.findIndex((d) => d.length < perDay);
    if (dayWithRoom >= 0) result[dayWithRoom].push(p);
    else break;
  }

  return result;
}
