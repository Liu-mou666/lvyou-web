import type { DayPlan, POI, PlanObjective, TripRequest } from "../types";
import { planRealRoute } from "../apis/route-planner";
import { minutesToTime } from "../realtime-engine";
import { optimizeRouteWithTimeWindows, totalRouteDistance } from "../optimizer";
import type { CityInfo } from "../apis/city-resolver";

/** 基于主日计划模板，仅重排景点与市内交通（不重新拉餐饮） */
export async function rebuildDayVisits(
  mainDay: DayPlan,
  newAttractions: POI[],
  cityInfo: CityInfo,
  request: TripRequest,
  objective: PlanObjective,
): Promise<DayPlan> {
  const travelers = request.travelers ?? 2;
  const rainy = mainDay.weather.condition === "rainy";
  const transportPref = request.transportPref ?? "mixed";
  const maxWalkKm = request.maxWalkKmPerDay ?? 8;

  const ordered = optimizeRouteWithTimeWindows(newAttractions, objective);
  const visitItems = mainDay.items.filter((i) => i.kind === "visit" && i.poi);
  const mealItems = mainDay.items.filter((i) => i.kind === "meal");
  const items: typeof mainDay.items = [];

  // 保留早餐
  const breakfast = mealItems.find((m) => m.startTime < "10:00");
  if (breakfast) items.push(breakfast);

  let currentMinutes = breakfast ? timeToMinutes(breakfast.endTime) : 8 * 60;
  let lastLocation: POI | null = breakfast?.poi ?? null;
  let walkKmToday = 0;

  const lunch = mealItems.find((m) => m.startTime >= "11:00" && m.startTime < "14:00");
  const dinner = mealItems.find((m) => m.startTime >= "17:00");

  for (let i = 0; i < ordered.length; i++) {
    const attraction = ordered[i];
    const templateVisit = visitItems.find((v) => v.poi?.id === attraction.id) ?? visitItems[i];

    if (i === 1 || (i === 0 && ordered.length === 1)) {
      if (lunch) {
        if (lastLocation) {
          const pref = walkKmToday >= maxWalkKm ? "taxi" : transportPref;
          const leg = await planRealRoute(lastLocation, lunch.poi!, cityInfo.name, travelers, rainy, pref, maxWalkKm);
          if (leg.mode === "walk") walkKmToday += leg.distanceKm;
          currentMinutes = timeToMinutes(lunch.startTime);
          items.push({
            kind: "transport",
            startTime: minutesToTime(currentMinutes - leg.durationMinutes),
            endTime: lunch.startTime,
            transport: leg,
          });
        }
        items.push(lunch);
        lastLocation = lunch.poi!;
        currentMinutes = timeToMinutes(lunch.endTime);
      }
    }

    if (lastLocation) {
      const pref = walkKmToday >= maxWalkKm ? "taxi" : transportPref;
      const leg = await planRealRoute(lastLocation, attraction, cityInfo.name, travelers, rainy, pref, maxWalkKm);
      if (leg.mode === "walk") walkKmToday += leg.distanceKm;
      const endMin = currentMinutes + leg.durationMinutes;
      items.push({
        kind: "transport",
        startTime: minutesToTime(currentMinutes),
        endTime: minutesToTime(endMin),
        transport: leg,
      });
      currentMinutes = endMin;
    }

    if (templateVisit) {
      items.push({
        ...templateVisit,
        poi: attraction,
        startTime: minutesToTime(currentMinutes),
        endTime: minutesToTime(currentMinutes + attraction.durationMinutes),
      });
      currentMinutes += attraction.durationMinutes;
      lastLocation = attraction;
    }
  }

  if (dinner && lastLocation) {
    const pref = walkKmToday >= maxWalkKm ? "taxi" : transportPref;
    const leg = await planRealRoute(lastLocation, dinner.poi!, cityInfo.name, travelers, rainy, pref, maxWalkKm);
    items.push({
      kind: "transport",
      startTime: minutesToTime(Math.max(currentMinutes, timeToMinutes(dinner.startTime) - leg.durationMinutes)),
      endTime: dinner.startTime,
      transport: leg,
    });
    items.push(dinner);
  }

  const visitPOIs = items.filter((i) => i.kind === "visit" && i.poi).map((i) => i.poi!);
  const transportCost = items.filter((i) => i.transport).reduce((s, i) => s + (i.transport?.cost ?? 0), 0);
  const poiCost = items.filter((i) => i.poi).reduce((s, i) => s + (i.poi?.cost ?? 0), 0);
  const hotelCost = mainDay.hotel?.pricePerPerson ?? 0;

  return {
    ...mainDay,
    items,
    totalCost: Math.round(poiCost + transportCost + hotelCost),
    totalDistance: totalRouteDistance(visitPOIs),
    summary: `${visitPOIs.length} 景点 · ${items.filter((i) => i.kind === "meal").length} 餐${mainDay.hotel ? " · 已推荐住宿" : ""} · ${mainDay.summary.split("·").slice(-1)[0]?.trim() ?? ""}`,
  };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export const VARIANT_META: Record<PlanObjective, { label: string; description: string }> = {
  value: { label: "省钱方案", description: "低价交通、免费/低价景点优先，总花费最低" },
  time: { label: "省时方案", description: "路线最短、高铁优先，市内少绕路" },
  experience: { label: "体验方案", description: "高评分、5A 与主题匹配优先" },
};
