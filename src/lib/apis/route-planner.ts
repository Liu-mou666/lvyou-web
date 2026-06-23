import {
  fetchDrivingRoute,
  fetchTransitRoute,
  fetchWalkingRoute,
  toOrigin,
} from "./amap";
import type { POI, TransportLeg, TransportMode } from "../types";
import { distance } from "../optimizer";

/** 调用高德路径规划 API，返回真实出行方案 */
export async function planRealRoute(
  from: POI,
  to: POI,
  city: string,
  travelers: number,
  rainy: boolean,
): Promise<TransportLeg> {
  const origin = toOrigin(from);
  const destination = toOrigin(to);
  const km = distance(from, to);

  try {
    // 近距离：步行
    if (km < 1.2) {
      const path = await fetchWalkingRoute(origin, destination);
      if (path) {
        return {
          mode: "walk",
          from: from.name,
          to: to.name,
          distanceKm: Math.round(parseInt(path.distance, 10) / 100) / 10,
          durationMinutes: Math.max(5, Math.round(parseInt(path.duration, 10) / 60)),
          cost: 0,
          reason: "高德实时路况 · 距离近建议步行",
        };
      }
    }

    // 中距离：公交地铁
    if (km < 8 && !rainy) {
      const transit = await fetchTransitRoute(origin, destination, city);
      if (transit) {
        const cost = parseFloat(transit.cost || "4") * travelers;
        return {
          mode: "subway",
          from: from.name,
          to: to.name,
          distanceKm: Math.round(parseInt(transit.distance, 10) / 100) / 10,
          durationMinutes: Math.max(8, Math.round(parseInt(transit.duration, 10) / 60)),
          cost: Math.round(cost),
          reason: "高德实时公交 · 地铁/公交最优方案",
        };
      }
    }

    // 远距离或雨天：驾车/打车
    const driving = await fetchDrivingRoute(origin, destination);
    if (driving) {
      const tolls = parseFloat(driving.tolls || "0");
      const baseFare = 13 + km * 2.3;
      return {
        mode: "taxi",
        from: from.name,
        to: to.name,
        distanceKm: Math.round(parseInt(driving.distance, 10) / 100) / 10,
        durationMinutes: Math.max(10, Math.round(parseInt(driving.duration, 10) / 60)),
        cost: Math.round(baseFare * 1.1 + tolls),
        reason: rainy ? "高德实时路况 · 雨天打车更舒适" : "高德实时路况 · 打车省时",
      };
    }
  } catch {
    // 降级到估算
  }

  return fallbackRoute(from, to, travelers, rainy, km);
}

function fallbackRoute(
  from: POI,
  to: POI,
  travelers: number,
  rainy: boolean,
  km: number,
): TransportLeg {
  let mode: TransportMode = "walk";
  let duration = Math.max(10, Math.round((km / 25) * 60));
  let cost = 0;
  let reason = "路线估算";

  if (km < 1) {
    mode = "walk";
    duration = Math.max(5, Math.round((km / 4.5) * 60));
    reason = "建议步行";
  } else if (km < 5 && !rainy) {
    mode = "subway";
    cost = 4 * travelers;
    reason = "建议地铁出行";
  } else {
    mode = "taxi";
    cost = Math.round(13 + km * 2.3);
    reason = rainy ? "雨天建议打车" : "建议打车";
  }

  return {
    mode,
    from: from.name,
    to: to.name,
    distanceKm: Math.round(km * 10) / 10,
    durationMinutes: duration,
    cost,
    reason,
  };
}
