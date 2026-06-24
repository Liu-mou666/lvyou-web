import type { BudgetBreakdown, DayPlan, Itinerary, POI, TrainRoute, TravelPace, TripRequest, TimelineItem } from "../types";

const PACE_ATTRACTIONS: Record<TravelPace, number> = {
  relaxed: 2,
  normal: 3,
  intense: 4,
};

export type { BudgetBreakdown };

function sumItems(days: DayPlan[], kind: "meal" | "visit"): number {
  let total = 0;
  for (const day of days) {
    for (const item of day.items) {
      if (item.kind === kind && item.poi) total += item.poi.cost;
    }
  }
  return total;
}

function sumLocalTransport(days: DayPlan[]): number {
  let total = 0;
  for (const day of days) {
    for (const item of day.items) {
      if (item.kind === "transport" && item.transport) total += item.transport.cost;
    }
  }
  return total;
}

function sumLodging(days: DayPlan[]): number {
  return days.reduce((s, d) => s + (d.hotel?.pricePerPerson ?? 0), 0);
}

function recalcDayCost(day: DayPlan): DayPlan {
  const transportCost = day.items.filter((i) => i.transport).reduce((s, i) => s + (i.transport?.cost ?? 0), 0);
  const poiCost = day.items.filter((i) => i.poi).reduce((s, i) => s + (i.poi?.cost ?? 0), 0);
  const hotelCost = day.hotel?.pricePerPerson ?? 0;
  return { ...day, totalCost: Math.round(poiCost + transportCost + hotelCost) };
}

function capPoiCost(poi: POI, maxPerPerson: number, travelers: number, minFloor = 0): POI {
  let capped = Math.min(poi.pricePerPerson, maxPerPerson);
  if (poi.type === "hotel" && minFloor > 0) capped = Math.max(capped, minFloor);
  return {
    ...poi,
    pricePerPerson: capped,
    cost: poi.type === "hotel" ? capped : Math.round(capped * travelers),
    priceNote: capped < poi.pricePerPerson ? `已按预算调整至 ¥${capped}${poi.type === "hotel" ? "/晚" : "/人"}` : poi.priceNote,
  };
}

function applyItemCap(item: TimelineItem, maxPerPerson: number, travelers: number): TimelineItem {
  if (!item.poi) return item;
  const poi = capPoiCost(item.poi, maxPerPerson, travelers);
  return { ...item, poi, note: item.note?.includes("预算") ? item.note : `${item.note ?? ""} · 预算内`.trim() };
}

const MIN_HOTEL_FLOOR = 120; // 情侣经济型底线 ¥120/晚

/** 硬约束：超预算时逐级压缩，酒店不低于 MIN_HOTEL_FLOOR；每天至少保留 minVisitsPerDay 个景点 */
function enforceLocalBudget(
  days: DayPlan[],
  maxLocal: number,
  travelers: number,
  minVisitsPerDay = 1,
): DayPlan[] {
  let result: DayPlan[] = JSON.parse(JSON.stringify(days)) as DayPlan[];

  const localTotal = () =>
    sumItems(result, "meal") + sumItems(result, "visit") + sumLodging(result) + sumLocalTransport(result);

  if (localTotal() <= maxLocal) return result.map(recalcDayCost);

  // 1) 压缩门票，酒店上限 180/晚
  for (const day of result) {
    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      if (item.kind === "visit" && item.poi && item.poi.pricePerPerson > 30) {
        day.items[i] = applyItemCap(item, 30, travelers);
      }
    }
    if (day.hotel && day.hotel.pricePerPerson > 180) {
      day.hotel = capPoiCost(day.hotel, 180, travelers, MIN_HOTEL_FLOOR);
    }
  }
  result = result.map(recalcDayCost);
  if (localTotal() <= maxLocal) return result;

  // 2) 进一步压缩门票/餐饮，酒店底线 120/晚（情侣可接受最低）
  for (const day of result) {
    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      if (!item.poi) continue;
      if (item.kind === "visit") day.items[i] = applyItemCap(item, 20, travelers);
      if (item.kind === "meal") day.items[i] = applyItemCap(item, 45, travelers);
    }
    if (day.hotel && day.hotel.pricePerPerson > MIN_HOTEL_FLOOR) {
      day.hotel = capPoiCost(day.hotel, MIN_HOTEL_FLOOR, travelers, MIN_HOTEL_FLOOR);
    }
  }
  result = result.map(recalcDayCost);
  if (localTotal() <= maxLocal) return result;

  // 3) 仍超：移除最贵付费景点（每天至少留 minVisitsPerDay 个）
  while (localTotal() > maxLocal) {
    let removed = false;
    const visits: { dayIdx: number; itemIdx: number; cost: number }[] = [];
    result.forEach((day, di) => {
      const visitCount = day.items.filter((i) => i.kind === "visit").length;
      day.items.forEach((item, ii) => {
        if (item.kind === "visit" && item.poi && item.poi.cost > 0 && visitCount > minVisitsPerDay) {
          visits.push({ dayIdx: di, itemIdx: ii, cost: item.poi.cost });
        }
      });
    });
    if (visits.length === 0) break;
    visits.sort((a, b) => b.cost - a.cost);
    const { dayIdx, itemIdx } = visits[0];
    result[dayIdx].items.splice(itemIdx, 1);
    result = result.map(recalcDayCost);
    removed = true;
    if (!removed) break;
  }

  // 4) 压缩市内交通
  if (localTotal() > maxLocal) {
    for (const day of result) {
      for (const item of day.items) {
        if (item.transport && item.transport.cost > 15) {
          item.transport = { ...item.transport, cost: 15 };
        }
      }
    }
    result = result.map(recalcDayCost);
  }

  return result;
}

export function computeBudgetBreakdown(
  days: DayPlan[],
  travelCost: number,
  limit: number,
): BudgetBreakdown {
  const meals = sumItems(days, "meal");
  const attractions = sumItems(days, "visit");
  const localTransport = sumLocalTransport(days);
  const lodging = sumLodging(days);
  const total = travelCost + meals + attractions + localTransport + lodging;

  if (limit <= 0) {
    return {
      limit: 0,
      travel: travelCost,
      lodging,
      meals,
      attractions,
      localTransport,
      total,
      status: "unset",
      savingsTips: [],
    };
  }

  const ratio = total / limit;
  const savingsTips: string[] = [];

  if (ratio > 1) {
    savingsTips.push(`超出预算 ¥${total - limit}，建议缩短天数或选择更经济的交通/住宿`);
    if (travelCost > limit * 0.35) {
      savingsTips.push(
        `去程交通 ¥${travelCost} 占 ${Math.round((travelCost / limit) * 100)}%：湘鄂→华东建议经武汉/汉口中转，通常比绕上海便宜；或提高总预算`,
      );
    }
    if (lodging > limit * 0.35) savingsTips.push("住宿已压缩至经济型，可改选青旅/民宿");
    if (attractions > limit * 0.3) savingsTips.push("已优先免费/低价景点，部分收费景区已移除或降价");
    if (meals > limit * 0.25) savingsTips.push("餐饮已按预算上限筛选");
  } else if (ratio > 0.9) {
    savingsTips.push("预算较紧，已自动压缩门票/住宿/餐饮，仍建议留 10% 机动金");
  } else if (ratio <= 1) {
    savingsTips.push("方案已控制在预算内");
  }

  return {
    limit,
    travel: travelCost,
    lodging,
    meals,
    attractions,
    localTransport,
    total,
    status: ratio > 1 ? "over" : ratio > 0.9 ? "tight" : "within",
    savingsTips,
    budgetGap: ratio > 1 ? total - limit : 0,
  };
}

export function pickTransportUnderBudget(
  trainRoutes: TrainRoute[] | undefined,
  totalBudget: number,
  localEstimate: number,
): { routes: TrainRoute[]; travelCost: number; adjusted: boolean } {
  if (!trainRoutes?.length || totalBudget <= 0) {
    const cost = trainRoutes?.find((r) => r.recommended)?.totalPrice ?? trainRoutes?.[0]?.totalPrice ?? 0;
    return { routes: trainRoutes ?? [], travelCost: cost, adjusted: false };
  }

  const maxTravel = Math.max(0, totalBudget * 0.35);
  const sorted = [...trainRoutes].sort((a, b) => a.totalPrice - b.totalPrice);
  const feasible = sorted.find((r) => r.totalPrice <= maxTravel) ?? sorted[0];

  const routes = trainRoutes.map((r) => {
    const isBest = r.id === feasible.id;
    const baseTitle = r.title.replace(/ ★ 推荐/g, "").replace(/ ★ 预算优选/g, "");
    return {
      ...r,
      recommended: isBest,
      title: isBest ? `${baseTitle} ★ 预算优选` : baseTitle,
    };
  });

  return { routes, travelCost: feasible.totalPrice, adjusted: feasible.id !== trainRoutes.find((r) => r.recommended)?.id };
}

export function inferBudgetLevelFromTotal(totalBudget: number, days: number, travelers: number): TripRequest["budget"] {
  const perPersonDay = totalBudget / Math.max(days * travelers, 1);
  if (perPersonDay < 350) return "budget";
  if (perPersonDay < 700) return "moderate";
  return "luxury";
}

export function applyBudgetToItinerary(itinerary: Itinerary, request: TripRequest): Itinerary {
  const limit = request.totalBudget ?? 0;
  const travelers = request.travelers ?? 2;

  if (limit <= 0) {
    const travelCost = itinerary.trainRoutes?.find((r) => r.recommended)?.totalPrice ?? 0;
    return {
      ...itinerary,
      budgetBreakdown: computeBudgetBreakdown(itinerary.days, travelCost, 0),
    };
  }

  const { routes, travelCost, adjusted } = pickTransportUnderBudget(
    itinerary.trainRoutes,
    limit,
    0,
  );

  const maxLocal = Math.max(0, limit - travelCost);
  const minVisitsPerDay = PACE_ATTRACTIONS[request.pace ?? "normal"];
  let days = enforceLocalBudget(itinerary.days, maxLocal, travelers, minVisitsPerDay);

  let breakdown = computeBudgetBreakdown(days, travelCost, limit);

  // 若交通仍导致超预算，换最便宜交通再压一次
  if (breakdown.status === "over" && routes.length > 1) {
    const cheapest = [...routes].sort((a, b) => a.totalPrice - b.totalPrice)[0];
    const cheaperTravel = cheapest.totalPrice;
    days = enforceLocalBudget(itinerary.days, Math.max(0, limit - cheaperTravel), travelers, minVisitsPerDay);
    breakdown = computeBudgetBreakdown(days, cheaperTravel, limit);
    routes.forEach((r) => {
      r.recommended = r.id === cheapest.id;
      if (r.recommended && !r.title.includes("预算优选")) {
        r.title = r.title.replace(/ ★ 推荐/g, "") + " ★ 预算优选";
      }
    });
  }

  const recommended = routes.find((r) => r.recommended)?.title ?? itinerary.recommendedTransport;

  let realtimeNote = itinerary.realtimeNote;
  if (adjusted) realtimeNote += " · 已按总预算切换至更经济的去程交通";
  if (breakdown.status === "within") {
    realtimeNote += ` · 已压缩至预算 ¥${limit} 内`;
  } else if (breakdown.status === "over") {
    const minSuggest = Math.round(travelCost + days.length * 350);
    realtimeNote += ` · ⚠ 仍超预算 ¥${breakdown.total - limit}；此线路建议总预算至少 ¥${minSuggest}（2人）`;
  }

  return {
    ...itinerary,
    days,
    trainRoutes: routes,
    recommendedTransport: recommended,
    totalCost: breakdown.total,
    totalBudget: limit,
    budgetBreakdown: breakdown,
    realtimeNote,
  };
}
