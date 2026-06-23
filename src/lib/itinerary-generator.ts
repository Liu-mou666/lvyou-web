import {
  fetchNearbyRestaurants,
  fetchRealAttractions,
  fetchRealWeatherForecast,
  fetchHotelsNearLocation,
  fetchSpecialPOIs,
  parseNotesKeywords,
  resolveCityInfo,
} from "./apis/data-fetcher";
import { buildOptimalTravelTickets } from "./apis/travel-tickets";
import type { CityInfo } from "./apis/city-resolver";
import { calcOptimizationScore, optimizeRoute, totalRouteDistance } from "./optimizer";
import { planRealRoute } from "./apis/route-planner";
import { minutesToTime, rankPOIs } from "./realtime-engine";
import type {
  BudgetLevel,
  DayPlan,
  Itinerary,
  MealTime,
  POI,
  RealtimeContext,
  RealtimeMetrics,
  TimelineItem,
  TravelPace,
  TripRequest,
  WeatherForecast,
} from "./types";
import { applyBudgetToItinerary, inferBudgetLevelFromTotal } from "./engine/budget-planner";
import { weatherLabel } from "./weather";
import type { GenerateStreamEvent } from "./types/stream";

const PACE_ATTRACTIONS: Record<TravelPace, number> = {
  relaxed: 2,
  normal: 3,
  intense: 4,
};

const BUDGET_MEAL_CAP: Record<BudgetLevel, number> = {
  budget: 80,
  moderate: 150,
  luxury: 0,
};

function makeCtx(
  request: TripRequest,
  date: string,
  weather: WeatherForecast,
  currentTime: string,
): RealtimeContext {
  const mealCap = request.maxMealBudget ?? BUDGET_MEAL_CAP[request.budget];
  return {
    city: request.city,
    date,
    currentTime,
    weather,
    budget: request.budget,
    style: request.style,
    travelers: request.travelers ?? 2,
    priority: request.priority ?? "value",
    avoidCrowd: request.avoidCrowd ?? false,
    maxMealBudget: mealCap,
    totalBudget: request.totalBudget ?? 0,
    days: request.days,
  };
}

function defaultMetrics(poi: POI, cityName?: string): RealtimeMetrics {
  return {
    popularity: Math.min(100, Math.round(poi.rating * 20)),
    isOpen: true,
    score: Math.round((poi.compositeRating ?? poi.rating) * 18 + (poi.authorityTag ? 15 : 0)),
    scoreReasons: [
      poi.authorityTag ? `文旅部 ${poi.authorityTag}` : "",
      `高德 ${poi.rating} 分`,
      poi.pricePerPerson > 0 ? `参考 ¥${poi.pricePerPerson}` : "",
    ].filter(Boolean),
    dataTimestamp: new Date().toISOString(),
    dataSources: ["高德地图", poi.authorityTag ? "文旅部5A名录" : ""].filter(Boolean),
    crowdAvailable: false,
  };
}

async function addTransport(
  items: TimelineItem[],
  from: POI,
  to: POI,
  startMinutes: number,
  city: string,
  travelers: number,
  rainy: boolean,
): Promise<number> {
  const leg = await planRealRoute(from, to, city, travelers, rainy);
  const endMinutes = startMinutes + leg.durationMinutes;
  items.push({
    kind: "transport",
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
    transport: leg,
    note: leg.reason,
  });
  return endMinutes;
}

function addVisitOrMeal(
  items: TimelineItem[],
  poi: POI,
  realtime: RealtimeMetrics,
  kind: "visit" | "meal",
  startMinutes: number,
  note?: string,
  alternatives?: POI[],
): number {
  const endMinutes = startMinutes + poi.durationMinutes;
  items.push({ kind, startTime: minutesToTime(startMinutes), endTime: minutesToTime(endMinutes), poi, realtime, note, alternatives });
  return endMinutes;
}

async function pickMealNearby(
  mealTime: MealTime,
  near: POI,
  cityInfo: CityInfo,
  ctx: RealtimeContext,
  request: TripRequest,
  usedIds: Set<string>,
): Promise<{ poi: POI; realtime: RealtimeMetrics; alternatives: POI[] } | null> {
  const nearby = await fetchNearbyRestaurants(
    `${near.lng},${near.lat}`,
    cityInfo,
    mealTime,
    12,
    request.mealPref,
    request.budget,
  );
  const pool = nearby.filter((r) => !usedIds.has(r.id));
  const ranked = rankPOIs(pool.length > 0 ? pool : nearby, ctx, near, { limit: 5, minScore: 10, cityName: cityInfo.name });
  if (ranked.length === 0) return null;
  return {
    poi: ranked[0].poi,
    realtime: ranked[0].realtime,
    alternatives: ranked.slice(1, 4).map((r) => r.poi),
  };
}

async function buildDayPlan(
  dayIndex: number,
  date: string,
  weather: WeatherForecast,
  attractions: POI[],
  cityInfo: CityInfo,
  request: TripRequest,
  specialPOIs: POI[] = [],
): Promise<DayPlan> {
  const travelers = request.travelers ?? 2;
  const rainy = weather.condition === "rainy";
  const items: TimelineItem[] = [];
  const usedRestaurantIds = new Set<string>();
  let currentMinutes = 8 * 60;
  let lastLocation: POI | null = null;

  // 景点不因雨天被过滤掉 — 直接路线优化，雨天仅影响排序提示
  const dayAttractions = optimizeRoute([...attractions]);
  const anchor = dayAttractions[0] ?? attractions[0];
  if (!anchor) {
    return {
      day: dayIndex + 1,
      date,
      weather,
      items: [],
      totalCost: 0,
      totalDistance: 0,
      summary: `暂无景点数据 · ${weatherLabel(weather.condition)} ${weather.tempLow}°~${weather.tempHigh}°C`,
    };
  }

  const breakfastCtx = makeCtx(request, date, weather, minutesToTime(currentMinutes));
  const breakfast = await pickMealNearby("breakfast", anchor, cityInfo, breakfastCtx, request, usedRestaurantIds);
  if (breakfast) {
    usedRestaurantIds.add(breakfast.poi.id);
    currentMinutes = addVisitOrMeal(
      items, breakfast.poi, breakfast.realtime, "meal", currentMinutes,
      `评分 ${breakfast.realtime.score} · ${breakfast.poi.rating} 分 · 人均约¥${breakfast.poi.pricePerPerson}`,
      breakfast.alternatives,
    );
    lastLocation = breakfast.poi;
  }

  // 特殊需求 POI 插入第一个半天（如妆造体验）
  const daySpecial = specialPOIs.filter((_, i) => i === dayIndex || (dayIndex === 0 && specialPOIs.length === 1));
  for (const special of daySpecial) {
    if (lastLocation) {
      currentMinutes = await addTransport(items, lastLocation, special, currentMinutes, cityInfo.name, travelers, rainy);
    }
    const rt = defaultMetrics(special, cityInfo.name);
    rt.scoreReasons = ["您的特殊需求", `高德 ${special.rating} 分`];
    currentMinutes = addVisitOrMeal(
      items, special, rt, "visit", currentMinutes,
      `特殊需求 · ${special.name} · ${special.rating} 分`,
    );
    lastLocation = special;
  }

  for (let i = 0; i < dayAttractions.length; i++) {
    const attraction = dayAttractions[i];
    const slotCtx = makeCtx(request, date, weather, minutesToTime(currentMinutes));
    const ranked = rankPOIs([attraction], slotCtx, lastLocation ?? undefined, { limit: 1, minScore: 0, cityName: cityInfo.name });
    const realtime = ranked[0]?.realtime ?? defaultMetrics(attraction, cityInfo.name);
    if (rainy && !attraction.indoor) {
      realtime.scoreReasons = [...realtime.scoreReasons, "雨天建议备伞"];
    }

    if (i === 1 || (i === 0 && dayAttractions.length === 1)) {
      const lunchNear = lastLocation ?? attraction;
      const lunchCtx = makeCtx(request, date, weather, "12:00");
      const lunch = await pickMealNearby("lunch", lunchNear, cityInfo, lunchCtx, request, usedRestaurantIds);
      if (lunch) {
        if (lastLocation) {
          currentMinutes = await addTransport(
            items, lastLocation, lunch.poi, Math.max(currentMinutes, 11 * 60 + 30), cityInfo.name, travelers, rainy,
          );
        }
        currentMinutes = addVisitOrMeal(
          items, lunch.poi, lunch.realtime, "meal", Math.max(currentMinutes, 12 * 60),
          `评分 ${lunch.realtime.score} · ${lunch.poi.rating} 分 · 人均约¥${lunch.poi.pricePerPerson}`,
          lunch.alternatives,
        );
        usedRestaurantIds.add(lunch.poi.id);
        lastLocation = lunch.poi;
      }
    }

    if (lastLocation) {
      currentMinutes = await addTransport(items, lastLocation, attraction, currentMinutes, cityInfo.name, travelers, rainy);
    }

    currentMinutes = addVisitOrMeal(
      items, attraction, realtime, "visit", currentMinutes,
      `${attraction.rating} 分 · 综合 ${realtime.score} 分`,
    );
    lastLocation = attraction;
  }

  if (lastLocation) {
    const dinnerCtx = makeCtx(request, date, weather, "18:30");
    const dinner = await pickMealNearby("dinner", lastLocation, cityInfo, dinnerCtx, request, usedRestaurantIds);
    if (dinner) {
      currentMinutes = await addTransport(
        items, lastLocation, dinner.poi, Math.max(currentMinutes, 18 * 60 + 30), cityInfo.name, travelers, rainy,
      );
      addVisitOrMeal(
        items, dinner.poi, dinner.realtime, "meal", currentMinutes,
        `评分 ${dinner.realtime.score} · ${dinner.poi.rating} 分 · 人均约¥${dinner.poi.pricePerPerson}`,
        dinner.alternatives,
      );
      lastLocation = dinner.poi;
    }
  }

  // 酒店：当日最后一站附近
  let hotel: POI | undefined;
  let hotelAlternatives: POI[] | undefined;
  if (lastLocation) {
    const hotels = await fetchHotelsNearLocation(
      `${lastLocation.lng},${lastLocation.lat}`,
      cityInfo,
      request.budget,
      3,
      date,
    );
    if (hotels.length > 0) {
      hotel = hotels[0];
      hotelAlternatives = hotels.slice(1, 3);
    }
  }

  const visitPOIs = items.filter((i) => i.kind === "visit" && i.poi).map((i) => i.poi!);
  const transportCost = items.filter((i) => i.transport).reduce((s, i) => s + (i.transport?.cost ?? 0), 0);
  const poiCost = items.filter((i) => i.poi).reduce((s, i) => s + (i.poi?.cost ?? 0), 0);
  const hotelCost = hotel?.pricePerPerson ?? 0;

  return {
    day: dayIndex + 1,
    date,
    weather,
    items,
    hotel,
    hotelAlternatives,
    totalCost: Math.round(poiCost + transportCost + hotelCost),
    totalDistance: totalRouteDistance(visitPOIs),
    summary: `${visitPOIs.length} 景点 · ${items.filter((i) => i.kind === "meal").length} 餐${hotel ? " · 已推荐住宿" : ""} · ${weatherLabel(weather.condition)} ${weather.tempLow}°~${weather.tempHigh}°C`,
  };
}

/** 将景点池分配到各天：全程不重复，优先高分顺序 */
function distributeAttractions(pool: POI[], days: number, perDay: number): POI[][] {
  const used = new Set<string>();
  const unique = pool.filter((p) => {
    const key = p.id || p.name;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });

  const result: POI[][] = [];
  let idx = 0;
  for (let d = 0; d < days; d++) {
    const day: POI[] = [];
    while (day.length < perDay && idx < unique.length) {
      day.push(unique[idx]);
      idx++;
    }
    result.push(day);
  }
  return result;
}

function adjustAttractionForPace(poi: POI, pace: TravelPace): POI {
  if (pace !== "intense") return poi;
  return { ...poi, durationMinutes: Math.min(poi.durationMinutes, 90) };
}

export async function generateItinerary(request: TripRequest): Promise<Itinerary> {
  const travelers = request.travelers ?? 2;
  const effectiveBudget =
    request.totalBudget && request.totalBudget > 0
      ? inferBudgetLevelFromTotal(request.totalBudget, request.days, travelers)
      : request.budget;
  const req: TripRequest = { ...request, budget: effectiveBudget, travelers };

  const cityInfo = await resolveCityInfo(req.city);
  const perDay = PACE_ATTRACTIONS[req.pace];
  const needed = req.days * perDay;
  const departureCity = req.departureCity?.trim() || "上海";
  const noteKeywords = parseNotesKeywords(req.notes);

  const [forecasts, attractionResult, ticketResult, specialPOIs] = await Promise.all([
    fetchRealWeatherForecast(cityInfo, req.startDate, req.days),
    fetchRealAttractions(cityInfo, req.style, needed + 12, {
      priority: req.priority,
      budget: req.budget,
      totalBudget: req.totalBudget,
    }),
    departureCity !== cityInfo.name
      ? buildOptimalTravelTickets(req, cityInfo).catch((err) => {
          console.warn("[generate] travel tickets failed:", err);
          return null;
        })
      : Promise.resolve(null),
    noteKeywords.length > 0 ? fetchSpecialPOIs(cityInfo, noteKeywords) : Promise.resolve([]),
  ]);

  const { pool: rawPool, topRanked } = attractionResult;
  const attractionPool = rawPool.map((p) => adjustAttractionForPace(p, req.pace));

  if (attractionPool.length === 0 && specialPOIs.length === 0) {
    throw new Error(`未在「${cityInfo.formattedAddress}」找到足够景点，请换更具体的地名`);
  }

  const dayAttractionLists = distributeAttractions(attractionPool, req.days, perDay);

  const dayPlans: DayPlan[] = [];
  for (let d = 0; d < req.days; d++) {
    dayPlans.push(
      await buildDayPlan(
        d,
        forecasts[d].date,
        forecasts[d],
        dayAttractionLists[d] ?? [],
        cityInfo,
        req,
        specialPOIs,
      ),
    );
  }

  const allScores: number[] = [];
  dayPlans.forEach((day) => day.items.forEach((item) => { if (item.realtime) allScores.push(item.realtime.score); }));
  const avgRealtimeScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 80;
  const avgRating = attractionPool.slice(0, needed).reduce((s, p) => s + p.rating, 0) / Math.max(needed, 1);
  const rainyDays = forecasts.filter((f) => f.condition === "rainy").length;

  const trainRoutes = ticketResult?.trainRoutes;
  const flightOption = ticketResult?.flightOption;
  const busOption = ticketResult?.busOption;
  const recommendedTransport = ticketResult?.recommended;
  const routeDistanceKm = ticketResult?.routeInfo.distanceKm;

  const dayCost = dayPlans.reduce((sum, d) => sum + d.totalCost, 0);
  const travelCost = trainRoutes?.find((r) => r.recommended)?.totalPrice ?? 0;

  const noteSummary = specialPOIs.length > 0 ? ` · 已安排：${specialPOIs.map((p) => p.name).join("、")}` : "";

  const base: Itinerary = {
    city: cityInfo.name,
    cityInfo: {
      name: cityInfo.name,
      province: cityInfo.province,
      adcode: cityInfo.adcode,
      formattedAddress: cityInfo.formattedAddress,
    },
    trainRoutes,
    flightOption,
    busOption,
    recommendedTransport,
    routeDistanceKm,
    days: dayPlans,
    totalCost: dayCost + travelCost,
    generatedAt: new Date().toISOString(),
    optimizationScore: calcOptimizationScore(
      dayPlans.map((d) => d.totalDistance),
      avgRating,
      Math.max(60, 100 - rainyDays * 15),
      avgRealtimeScore,
    ),
    realtimeNote: `${new Date().toLocaleString("zh-CN")} · ${cityInfo.province}${cityInfo.name}${noteSummary} · 数据来源见各卡片「查看依据」`,
    dataSources: ["高德地图", "全国铁路站码库", "文旅部5A名录", ticketResult?.trainRoutes?.[0]?.dataSource ?? ""].filter(Boolean),
    transportEvidence: ticketResult?.transportEvidence,
    totalBudget: req.totalBudget,
    topAttractions: topRanked,
  };

  return applyBudgetToItinerary(base, req);
}

/** 流式生成：按阶段推送进度与部分结果 */
export async function generateItineraryWithProgress(
  request: TripRequest,
  emit: (event: GenerateStreamEvent) => void,
): Promise<Itinerary> {
  const emitProgress = (step: string, percent: number, message: string) => {
    emit({ type: "progress", step, percent, message });
  };

  try {
    emitProgress("start", 5, "正在解析目的地…");

    const travelers = request.travelers ?? 2;
    const effectiveBudget =
      request.totalBudget && request.totalBudget > 0
        ? inferBudgetLevelFromTotal(request.totalBudget, request.days, travelers)
        : request.budget;
    const req: TripRequest = { ...request, budget: effectiveBudget, travelers };

    const cityInfo = await resolveCityInfo(req.city);
    emitProgress("city", 12, `已定位 ${cityInfo.formattedAddress}`);

    const perDay = PACE_ATTRACTIONS[req.pace];
    const needed = req.days * perDay;
    const departureCity = req.departureCity?.trim() || "上海";
    const noteKeywords = parseNotesKeywords(req.notes);

    emitProgress("fetch", 18, "正在查询天气与交通…");

    const forecastsPromise = fetchRealWeatherForecast(cityInfo, req.startDate, req.days);
    const ticketsPromise =
      departureCity !== cityInfo.name
        ? buildOptimalTravelTickets(req, cityInfo).catch(() => null)
        : Promise.resolve(null);
    const specialPromise =
      noteKeywords.length > 0 ? fetchSpecialPOIs(cityInfo, noteKeywords) : Promise.resolve([]);

    const [forecasts, ticketResult, specialPOIs] = await Promise.all([
      forecastsPromise,
      ticketsPromise,
      specialPromise,
    ]);

    if (ticketResult?.trainRoutes) {
      emit({
        type: "partial",
        patch: {
          city: cityInfo.name,
          cityInfo: {
            name: cityInfo.name,
            province: cityInfo.province,
            adcode: cityInfo.adcode,
            formattedAddress: cityInfo.formattedAddress,
          },
          trainRoutes: ticketResult.trainRoutes,
          flightOption: ticketResult.flightOption,
          busOption: ticketResult.busOption,
          recommendedTransport: ticketResult.recommended,
          routeDistanceKm: ticketResult.routeInfo?.distanceKm,
          transportEvidence: ticketResult.transportEvidence,
        },
      });
      emitProgress("transport", 35, "交通方案已就绪");
    }

    emitProgress("attractions", 40, "正在筛选必去景点与实拍图…");

    const attractionResult = await fetchRealAttractions(cityInfo, req.style, needed + 12, {
      priority: req.priority,
      budget: req.budget,
      totalBudget: req.totalBudget,
    });

    const { pool: rawPool, topRanked } = attractionResult;
    const attractionPool = rawPool.map((p) => adjustAttractionForPace(p, req.pace));

    if (attractionPool.length === 0 && specialPOIs.length === 0) {
      throw new Error(`未在「${cityInfo.formattedAddress}」找到足够景点，请换更具体的地名`);
    }

    emit({
      type: "partial",
      patch: { topAttractions: topRanked },
    });
    emitProgress("ranked", 55, `必去榜 TOP${topRanked.length} 已生成`);

    const dayAttractionLists = distributeAttractions(attractionPool, req.days, perDay);
    const dayPlans: DayPlan[] = [];
    const daySpan = 40 / req.days;

    for (let d = 0; d < req.days; d++) {
      emitProgress(
        `day-${d}`,
        55 + Math.round(daySpan * d),
        `正在规划第 ${d + 1} 天行程…`,
      );
      const dayPlan = await buildDayPlan(
        d,
        forecasts[d].date,
        forecasts[d],
        dayAttractionLists[d] ?? [],
        cityInfo,
        req,
        specialPOIs,
      );
      dayPlans.push(dayPlan);
      emit({ type: "day", day: d + 1, dayPlan });
    }

    const allScores: number[] = [];
    dayPlans.forEach((day) =>
      day.items.forEach((item) => {
        if (item.realtime) allScores.push(item.realtime.score);
      }),
    );
    const avgRealtimeScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 80;
    const avgRating =
      attractionPool.slice(0, needed).reduce((s, p) => s + p.rating, 0) / Math.max(needed, 1);
    const rainyDays = forecasts.filter((f) => f.condition === "rainy").length;

    const trainRoutes = ticketResult?.trainRoutes;
    const travelCost = trainRoutes?.find((r) => r.recommended)?.totalPrice ?? 0;
    const dayCost = dayPlans.reduce((sum, d) => sum + d.totalCost, 0);
    const noteSummary =
      specialPOIs.length > 0 ? ` · 已安排：${specialPOIs.map((p) => p.name).join("、")}` : "";

    const base: Itinerary = {
      city: cityInfo.name,
      cityInfo: {
        name: cityInfo.name,
        province: cityInfo.province,
        adcode: cityInfo.adcode,
        formattedAddress: cityInfo.formattedAddress,
      },
      trainRoutes,
      flightOption: ticketResult?.flightOption,
      busOption: ticketResult?.busOption,
      recommendedTransport: ticketResult?.recommended,
      routeDistanceKm: ticketResult?.routeInfo?.distanceKm,
      days: dayPlans,
      totalCost: dayCost + travelCost,
      generatedAt: new Date().toISOString(),
      optimizationScore: calcOptimizationScore(
        dayPlans.map((d) => d.totalDistance),
        avgRating,
        Math.max(60, 100 - rainyDays * 15),
        avgRealtimeScore,
      ),
      realtimeNote: `${new Date().toLocaleString("zh-CN")} · ${cityInfo.province}${cityInfo.name}${noteSummary} · 数据来源见各卡片「查看依据」`,
      dataSources: [
        "高德地图",
        "全国铁路站码库",
        "文旅部5A名录",
        ticketResult?.trainRoutes?.[0]?.dataSource ?? "",
      ].filter(Boolean),
      transportEvidence: ticketResult?.transportEvidence,
      totalBudget: req.totalBudget,
      topAttractions: topRanked,
    };

    emitProgress("budget", 92, "正在优化预算…");
    const finalItinerary = applyBudgetToItinerary(base, req);
    emitProgress("done", 100, "行程生成完成");
    emit({ type: "complete", itinerary: finalItinerary });
    return finalItinerary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    emit({ type: "error", message });
    throw err;
  }
}

export async function refreshDayItinerary(request: TripRequest, dayIndex: number): Promise<DayPlan | null> {
  const cityInfo = await resolveCityInfo(request.city);
  const forecasts = await fetchRealWeatherForecast(cityInfo, request.startDate, request.days);
  if (dayIndex >= forecasts.length) return null;

  const perDay = PACE_ATTRACTIONS[request.pace];
  const result = await fetchRealAttractions(cityInfo, request.style, (dayIndex + 1) * perDay + 4, {
    priority: request.priority,
    budget: request.budget,
    totalBudget: request.totalBudget,
  });
  const dayAttractions = result.pool
    .map((p) => adjustAttractionForPace(p, request.pace))
    .slice(dayIndex * perDay, (dayIndex + 1) * perDay);
  if (dayAttractions.length === 0) return null;

  const specialPOIs = await fetchSpecialPOIs(cityInfo, parseNotesKeywords(request.notes));
  return buildDayPlan(dayIndex, forecasts[dayIndex].date, forecasts[dayIndex], dayAttractions, cityInfo, request, specialPOIs);
}
