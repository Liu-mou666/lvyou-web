import {
  fetchNearbyRestaurants,
  fetchRealAttractions,
  fetchRealWeatherForecast,
  fetchHotelsNearLocation,
  fetchSpecialPOIs,
  fetchMustVisitPOIs,
  resolveCityInfo,
} from "./apis/data-fetcher";
import { buildOptimalTravelTickets } from "./apis/travel-tickets";
import { buildPoiRecommendNote } from "./engine/recommend-text";
import { parsePlanningConstraints, filterExcluded, filterAccessibility } from "./engine/constraint-parser";
import { clusterDistributeAttractions } from "./engine/geo-cluster";
import { auditItineraryPrices } from "./engine/price-audit";
import type { CityInfo } from "./apis/city-resolver";
import { calcOptimizationScore, optimizeRouteWithTimeWindows, totalRouteDistance } from "./optimizer";
import { planRealRoute } from "./apis/route-planner";
import { minutesToTime, rankPOIs } from "./realtime-engine";
import type {
  BudgetLevel,
  DayPlan,
  Itinerary,
  ItineraryVariant,
  MealTime,
  PlanObjective,
  POI,
  RealtimeContext,
  RealtimeMetrics,
  TimelineItem,
  TravelPace,
  TripRequest,
  WeatherForecast,
} from "./types";
import { applyBudgetToItinerary, inferBudgetLevelFromTotal } from "./engine/budget-planner";
import { VARIANT_META, rebuildDayVisits } from "./engine/day-variant";
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

function effectivePace(request: TripRequest): TravelPace {
  if (request.withChildren || request.withElderly) {
    if (request.pace === "intense") return "normal";
    if (request.pace === "normal") return "relaxed";
  }
  return request.pace;
}

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
    transportPref: request.transportPref ?? "mixed",
    maxWalkKmPerDay: request.maxWalkKmPerDay ?? 8,
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
  transportPref: TripRequest["transportPref"],
  maxWalkKm: number,
  walkKmToday: number,
): Promise<{ endMinutes: number; walkKmToday: number }> {
  const pref = walkKmToday >= maxWalkKm ? "taxi" : transportPref ?? "mixed";
  const leg = await planRealRoute(from, to, city, travelers, rainy, pref, maxWalkKm);
  const endMinutes = startMinutes + leg.durationMinutes;
  const newWalk = leg.mode === "walk" ? walkKmToday + leg.distanceKm : walkKmToday;
  items.push({
    kind: "transport",
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
    transport: leg,
    note: leg.reason,
  });
  return { endMinutes, walkKmToday: newWalk };
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
): Promise<{ poi: POI; realtime: RealtimeMetrics; alternatives: POI[]; recommendNote: string } | null> {
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
  const totalCandidates = pool.length || nearby.length;
  return {
    poi: ranked[0].poi,
    realtime: ranked[0].realtime,
    alternatives: ranked.slice(1, 4).map((r) => r.poi),
    recommendNote: buildPoiRecommendNote(ranked[0].poi, ranked[0].realtime, "meal", 1, totalCandidates),
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
  let currentMinutes =
    request.dayStart === "early"
      ? 7 * 60
      : request.dayStart === "late"
        ? 9 * 60
        : 8 * 60;
  let lastLocation: POI | null = null;

  const transportPref = request.transportPref ?? "mixed";
  const maxWalkKm = request.maxWalkKmPerDay ?? 8;
  let walkKmToday = 0;

  const objective: PlanObjective = objectiveFromPriority(request.priority);
  const dayAttractions = optimizeRouteWithTimeWindows([...attractions], objective);
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
      breakfast.recommendNote,
      breakfast.alternatives,
    );
    lastLocation = breakfast.poi;
  }

  // 特殊需求 POI 插入第一个半天（如妆造体验）
  const daySpecial = specialPOIs.filter((_, i) => i === dayIndex || (dayIndex === 0 && specialPOIs.length === 1));
  for (const special of daySpecial) {
    if (lastLocation) {
      const tr = await addTransport(
        items, lastLocation, special, currentMinutes, cityInfo.name, travelers, rainy, transportPref, maxWalkKm, walkKmToday,
      );
      currentMinutes = tr.endMinutes;
      walkKmToday = tr.walkKmToday;
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
          const tr = await addTransport(
            items, lastLocation, lunch.poi, Math.max(currentMinutes, 11 * 60 + 30), cityInfo.name, travelers, rainy, transportPref, maxWalkKm, walkKmToday,
          );
          currentMinutes = tr.endMinutes;
          walkKmToday = tr.walkKmToday;
        }
        currentMinutes = addVisitOrMeal(
          items, lunch.poi, lunch.realtime, "meal", Math.max(currentMinutes, 12 * 60),
          lunch.recommendNote,
          lunch.alternatives,
        );
        usedRestaurantIds.add(lunch.poi.id);
        lastLocation = lunch.poi;
      }
    }

    if (lastLocation) {
      const tr = await addTransport(
        items, lastLocation, attraction, currentMinutes, cityInfo.name, travelers, rainy, transportPref, maxWalkKm, walkKmToday,
      );
      currentMinutes = tr.endMinutes;
      walkKmToday = tr.walkKmToday;
    }

    currentMinutes = addVisitOrMeal(
      items, attraction, realtime, "visit", currentMinutes,
      buildPoiRecommendNote(attraction, realtime, "visit"),
    );
    lastLocation = attraction;
  }

  if (lastLocation) {
    const dinnerCtx = makeCtx(request, date, weather, "18:30");
    const dinner = await pickMealNearby("dinner", lastLocation, cityInfo, dinnerCtx, request, usedRestaurantIds);
    if (dinner) {
      const tr = await addTransport(
        items, lastLocation, dinner.poi, Math.max(currentMinutes, 18 * 60 + 30), cityInfo.name, travelers, rainy, transportPref, maxWalkKm, walkKmToday,
      );
      currentMinutes = tr.endMinutes;
      addVisitOrMeal(
        items, dinner.poi, dinner.realtime, "meal", currentMinutes,
        dinner.recommendNote,
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
      {
        priority: request.priority,
        totalBudget: request.totalBudget,
        days: request.days,
        travelers,
      },
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

function adjustAttractionForPace(poi: POI, pace: TravelPace): POI {
  if (pace !== "intense") return poi;
  return { ...poi, durationMinutes: Math.min(poi.durationMinutes, 90) };
}

async function buildAttractionPool(
  req: TripRequest,
  cityInfo: CityInfo,
  needed: number,
): Promise<{ pool: POI[]; topRanked: import("./types").RankedAttraction[]; specialPOIs: POI[] }> {
  const constraints = parsePlanningConstraints(req);
  const travelers = req.travelers ?? 2;

  const [attractionResult, mustVisitPOIs, specialPOIs] = await Promise.all([
    fetchRealAttractions(cityInfo, req.style, needed + 12, {
      priority: req.priority,
      budget: req.budget,
      totalBudget: req.totalBudget,
      travelers,
      maxTicketPerPerson: req.maxTicketPerPerson,
    }),
    constraints.mustVisit.length > 0
      ? fetchMustVisitPOIs(cityInfo, constraints.mustVisit, travelers)
      : Promise.resolve([]),
    constraints.specialKeywords.length > 0
      ? fetchSpecialPOIs(cityInfo, constraints.specialKeywords)
      : Promise.resolve([]),
  ]);

  let pool = filterExcluded(attractionResult.pool, constraints.exclude);
  if (constraints.accessibility) {
    pool = filterAccessibility(pool);
  }
  for (const m of mustVisitPOIs) {
    if (!pool.some((p) => p.id === m.id || p.name === m.name)) pool.unshift(m);
  }

  const pace = effectivePace(req);
  pool = pool.map((p) => adjustAttractionForPace(p, pace));

  return { pool, topRanked: attractionResult.topRanked, specialPOIs };
}

function objectiveFromPriority(priority?: TripRequest["priority"]): PlanObjective {
  if (priority === "time") return "time";
  if (priority === "experience") return "experience";
  return "value";
}

async function buildItineraryVariants(
  main: Itinerary,
  req: TripRequest,
  pool: POI[],
  cityInfo: CityInfo,
  perDay: number,
): Promise<ItineraryVariant[]> {
  const objectives: PlanObjective[] = ["value", "time", "experience"];
  const mainObjective = objectiveFromPriority(req.priority);
  const variants: ItineraryVariant[] = [];

  for (const obj of objectives) {
    if (obj === mainObjective) {
      variants.push({
        objective: obj,
        label: VARIANT_META[obj].label,
        description: VARIANT_META[obj].description,
        itinerary: main,
      });
      continue;
    }

    const dayLists = clusterDistributeAttractions(pool, req.days, perDay, obj);
    const days = await Promise.all(
      main.days.map((day, i) =>
        rebuildDayVisits(day, dayLists[i] ?? [], cityInfo, { ...req, priority: obj }, obj),
      ),
    );

    const travelCost = main.trainRoutes?.find((r) => r.recommended)?.totalPrice ?? 0;
    const variantBase: Itinerary = {
      ...main,
      days,
      totalCost: days.reduce((s, d) => s + d.totalCost, 0) + travelCost,
      optimizationScore: calcOptimizationScore(
        days.map((d) => d.totalDistance),
        pool.slice(0, req.days * perDay).reduce((s, p) => s + p.rating, 0) / Math.max(req.days * perDay, 1),
        main.optimizationScore,
        main.optimizationScore,
      ),
    };

    const withBudget = applyBudgetToItinerary(variantBase, { ...req, priority: obj });
    variants.push({
      objective: obj,
      label: VARIANT_META[obj].label,
      description: VARIANT_META[obj].description,
      itinerary: withBudget,
    });
  }

  return variants;
}

export async function generateItinerary(request: TripRequest): Promise<Itinerary> {
  const travelers = request.travelers ?? 2;
  const effectiveBudget =
    request.totalBudget && request.totalBudget > 0
      ? inferBudgetLevelFromTotal(request.totalBudget, request.days, travelers)
      : request.budget;
  const req: TripRequest = { ...request, budget: effectiveBudget, travelers };

  const cityInfo = await resolveCityInfo(req.city);
  const pace = effectivePace(req);
  const perDay = PACE_ATTRACTIONS[pace];
  const needed = req.days * perDay;
  const departureCity = req.departureCity?.trim() || "上海";
  const objective = objectiveFromPriority(req.priority);

  const [forecasts, ticketResult, poolResult] = await Promise.all([
    fetchRealWeatherForecast(cityInfo, req.startDate, req.days),
    departureCity !== cityInfo.name
      ? buildOptimalTravelTickets(req, cityInfo).catch((err) => {
          console.warn("[generate] travel tickets failed:", err);
          return null;
        })
      : Promise.resolve(null),
    buildAttractionPool(req, cityInfo, needed),
  ]);

  const { pool: attractionPool, topRanked, specialPOIs } = poolResult;

  if (attractionPool.length === 0 && specialPOIs.length === 0) {
    throw new Error(`未在「${cityInfo.formattedAddress}」找到足够景点，请换更具体的地名`);
  }

  const dayAttractionLists = clusterDistributeAttractions(attractionPool, req.days, perDay, objective);

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

  const final = applyBudgetToItinerary(base, req);
  const priceAudit = auditItineraryPrices(final);
  const variants = await buildItineraryVariants(final, req, attractionPool, cityInfo, perDay);
  return {
    ...final,
    variants,
    selectedVariant: objective,
    priceAudit,
  };
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

    const pace = effectivePace(req);
    const perDay = PACE_ATTRACTIONS[pace];
    const needed = req.days * perDay;
    const departureCity = req.departureCity?.trim() || "上海";
    const objective = objectiveFromPriority(req.priority);

    emitProgress("fetch", 18, "正在查询天气与交通…");

    const forecastsPromise = fetchRealWeatherForecast(cityInfo, req.startDate, req.days);
    const ticketsPromise =
      departureCity !== cityInfo.name
        ? buildOptimalTravelTickets(req, cityInfo).catch(() => null)
        : Promise.resolve(null);
    const poolPromise = buildAttractionPool(req, cityInfo, needed);

    const [forecasts, ticketResult, poolResult] = await Promise.all([
      forecastsPromise,
      ticketsPromise,
      poolPromise,
    ]);

    const { pool: attractionPool, topRanked, specialPOIs } = poolResult;

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

    emitProgress("attractions", 40, "正在地理聚类分配景点…");

    if (attractionPool.length === 0 && specialPOIs.length === 0) {
      throw new Error(`未在「${cityInfo.formattedAddress}」找到足够景点，请换更具体的地名`);
    }

    emit({
      type: "partial",
      patch: { topAttractions: topRanked },
    });
    emitProgress("ranked", 55, `必去榜 TOP${topRanked.length} 已生成`);

    const dayAttractionLists = clusterDistributeAttractions(attractionPool, req.days, perDay, objective);
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

    emitProgress("budget", 88, "正在优化预算与生成多方案…");
    const finalItinerary = applyBudgetToItinerary(base, req);
    const priceAudit = auditItineraryPrices(finalItinerary);
    const variants = await buildItineraryVariants(finalItinerary, req, attractionPool, cityInfo, perDay);
    const complete: Itinerary = {
      ...finalItinerary,
      variants,
      selectedVariant: objective,
      priceAudit,
    };
    emitProgress("done", 100, "行程生成完成（含 3 套方案）");
    emit({ type: "complete", itinerary: complete });
    return complete;
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

  const pace = effectivePace(request);
  const perDay = PACE_ATTRACTIONS[pace];
  const objective = objectiveFromPriority(request.priority);
  const needed = (dayIndex + 1) * perDay + 4;

  const { pool, specialPOIs } = await buildAttractionPool(request, cityInfo, needed);
  const dayLists = clusterDistributeAttractions(pool, request.days, perDay, objective);
  const dayAttractions = dayLists[dayIndex] ?? [];

  if (dayAttractions.length === 0) return null;

  return buildDayPlan(dayIndex, forecasts[dayIndex].date, forecasts[dayIndex], dayAttractions, cityInfo, request, specialPOIs);
}

/** 按用户指定景点顺序重算单日（拖拽改序） */
export async function reoptimizeDayItinerary(
  request: TripRequest,
  dayIndex: number,
  attractionIds: string[],
  templateDay: DayPlan,
): Promise<DayPlan | null> {
  const cityInfo = await resolveCityInfo(request.city);
  const needed = request.days * PACE_ATTRACTIONS[effectivePace(request)] + 12;
  const { pool } = await buildAttractionPool(request, cityInfo, needed);

  const ordered = attractionIds
    .map((id) => pool.find((p) => p.id === id))
    .filter((p): p is POI => p != null);

  if (ordered.length === 0) return null;

  const objective = objectiveFromPriority(request.priority);
  return rebuildDayVisits(templateDay, ordered, cityInfo, request, objective);
}
