import type { Location, POI, TransportLeg, TransportMode } from "./types";
import { distance } from "./optimizer";

const MODE_LABELS: Record<TransportMode, string> = {
  walk: "步行",
  bike: "骑行",
  subway: "地铁",
  bus: "公交",
  taxi: "打车",
};

const MODE_ICONS: Record<TransportMode, string> = {
  walk: "🚶",
  bike: "🚲",
  subway: "🚇",
  bus: "🚌",
  taxi: "🚕",
};

export function transportLabel(mode: TransportMode): string {
  return MODE_LABELS[mode];
}

export function transportIcon(mode: TransportMode): string {
  return MODE_ICONS[mode];
}

/** 根据距离、天气、人数推荐最优出行方式 */
export function recommendTransport(
  from: Location & { name: string },
  to: Location & { name: string },
  travelers: number,
  rainy: boolean,
): TransportLeg {
  const km = distance(from, to);
  let mode: TransportMode;
  let speedKmh: number;
  let costPerKm: number;
  let reason: string;

  if (km < 0.8) {
    mode = "walk";
    speedKmh = 4.5;
    costPerKm = 0;
    reason = "距离很近，步行最舒适";
  } else if (km < 2 && !rainy) {
    mode = "bike";
    speedKmh = 12;
    costPerKm = 0;
    reason = "短途骑行，灵活便捷";
  } else if (km < 5) {
    mode = rainy ? "taxi" : "subway";
    speedKmh = rainy ? 20 : 28;
    costPerKm = rainy ? 2.5 : 0;
    reason = rainy ? "雨天打车更方便" : "地铁准时且不堵车";
  } else if (km < 12) {
    mode = "subway";
    speedKmh = 30;
    costPerKm = 0;
    reason = "中距离地铁性价比最高";
  } else {
    mode = "taxi";
    speedKmh = 25;
    costPerKm = 2.2;
    reason = "远距离打车节省时间";
  }

  const durationMinutes = Math.max(5, Math.round((km / speedKmh) * 60 + 5));
  const baseCost = mode === "subway" ? 4 * travelers : 0;
  const cost = Math.round(baseCost + km * costPerKm * (mode === "taxi" ? 1 : 0));

  return {
    mode,
    from: from.name,
    to: to.name,
    distanceKm: Math.round(km * 10) / 10,
    durationMinutes,
    cost,
    reason,
  };
}

export function totalTransportCost(legs: TransportLeg[]): number {
  return legs.reduce((sum, l) => sum + l.cost, 0);
}
