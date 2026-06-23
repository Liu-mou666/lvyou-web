import { resolveCityInfo, type CityInfo } from "./city-resolver";
import { juheEvidence, queryJuheTrains } from "../data/providers/train-juhe";
import {
  ctripFlightUrl,
  ctripTrainUrl,
  getHubStations,
  haversineKm,
  resolveStation,
  resolveTrainStation,
  type RailStation,
} from "../data/station-db";
import {
  buildTrainBookingLinks,
  buildLegBookingLinks,
  buildTransferEvidence,
  findTransferHubs,
  formatDuration,
  lookupSegment,
  realisticTrainHours,
  trainPriceEstimate,
} from "../engine/transport-graph";
import type { Evidence, PlatformLink, TrainRoute, TripRequest } from "../types";
import { fetchDrivingRoute } from "./amap";

interface RouteAnalysis {
  distanceKm: number;
  driveHours: number;
  driveCost: number;
}

async function analyzeRoute(from: CityInfo, to: CityInfo): Promise<RouteAnalysis> {
  try {
    const path = await fetchDrivingRoute(`${from.lng},${from.lat}`, `${to.lng},${to.lat}`);
    if (path) {
      return {
        distanceKm: Math.round(parseInt(path.distance, 10) / 100) / 10,
        driveHours: Math.round(parseInt(path.duration, 10) / 360) / 10,
        driveCost: Math.round(parseInt(path.distance, 10) / 1000 * 0.8 + 50),
      };
    }
  } catch {
    /* fallback */
  }
  const km = haversineKm(from, to);
  return { distanceKm: km, driveHours: Math.round(km / 80), driveCost: Math.round(km * 0.8 + 50) };
}

function estimateTimes(totalHours: number, transferMin: number) {
  const depH = 7;
  const depM = 28;
  const totalMin = Math.round(totalHours * 60) + transferMin;
  const arrTotal = depH * 60 + depM + totalMin;
  const nextDay = arrTotal >= 24 * 60;
  return {
    dep: `${String(depH).padStart(2, "0")}:${String(depM).padStart(2, "0")}`,
    arr: `${String(Math.floor(arrTotal / 60) % 24).padStart(2, "0")}:${String(arrTotal % 60).padStart(2, "0")}${nextDay ? " (+1)" : ""}`,
  };
}

async function legFromJuheOrEstimate(
  fromSt: RailStation,
  toSt: RailStation,
  date: string,
  travelers: number,
  km: number,
): Promise<{ hours: number; price: number; juhe?: Awaited<ReturnType<typeof queryJuheTrains>> }> {
  const known = lookupSegment(fromSt.name, toSt.name);
  const juhe = await queryJuheTrains(fromSt.name, toSt.name, date);
  const best = juhe?.direct?.[0];

  const hours = best
    ? best.durationMinutes / 60
    : known?.hours ?? realisticTrainHours(km, fromSt, toSt);

  const price = best?.priceSecond
    ? Math.round(Math.min(best.priceSecond, 800) * travelers)
    : known
      ? Math.round(known.pricePerPerson * travelers)
      : trainPriceEstimate(km, travelers, fromSt, toSt);

  return { hours, price, juhe: juhe ?? undefined };
}

async function buildDirectRoute(
  fromSt: RailStation,
  toSt: RailStation,
  fromName: string,
  toName: string,
  date: string,
  travelers: number,
  directKm: number,
): Promise<TrainRoute | null> {
  const { hours, price, juhe } = await legFromJuheOrEstimate(fromSt, toSt, date, travelers, directKm);
  const times = juhe?.direct[0]
    ? { dep: juhe.direct[0].departTime, arr: juhe.direct[0].arriveTime }
    : estimateTimes(hours, 0);

  if (directKm > 900 && !juhe?.direct.length) return null;

  const evidence: Evidence[] = juhe ? [juheEvidence(juhe, fromSt.name, toSt.name)] : [{
    claim: "未配置 JUHE_TRAIN_KEY，直达方案为已知区段/距离估算",
    sources: [{ name: "站码库+区段库", value: `${fromSt.name}→${toSt.name} 约${Math.round(directKm)}km`, fetchedAt: new Date().toISOString() }],
    confidence: "medium" as const,
  }];

  return {
    id: "direct",
    type: "direct",
    title: juhe?.direct[0]?.trainNo ? `直达 ${juhe.direct[0].trainNo}` : "直达高铁/动车",
    legs: [{ from: fromSt.name, to: toSt.name, durationHours: hours, price }],
    totalHours: Math.round(hours * 10) / 10,
    totalPrice: price,
    transferMinutes: 0,
    departTime: times.dep,
    arriveTime: times.arr,
    description: `${fromSt.name} → ${toSt.name} · ${formatDuration(hours)} · 二等座约 ¥${price}（${travelers}人）`,
    score: 55,
    recommended: false,
    bookingUrl: ctripTrainUrl(fromSt.name, toSt.name, date),
    links: buildTrainBookingLinks(fromSt.name, toSt.name, date, fromSt, toSt),
    evidence,
    trainNumbers: juhe?.direct.map((t) => t.trainNo).filter(Boolean) as string[],
    dataSource: juhe?.source ?? "站码库+区段库",
  };
}

async function buildTransferRoute(
  fromSt: RailStation,
  toSt: RailStation,
  fromName: string,
  toName: string,
  date: string,
  travelers: number,
  cand: ReturnType<typeof findTransferHubs>[0],
  priority: TripRequest["priority"],
): Promise<TrainRoute> {
  const hub = cand.hub;
  const leg1 = await legFromJuheOrEstimate(fromSt, hub, date, travelers, cand.km1);
  const leg2 = await legFromJuheOrEstimate(hub, toSt, date, travelers, cand.km2);

  const h1 = leg1.hours;
  const h2 = leg2.hours;
  const transferMin = hub.name.includes("虹桥") ? 35 : hub.name.includes("上海") ? 40 : 45;
  const totalHours = Math.round((h1 + h2 + transferMin / 60) * 10) / 10;
  const price = leg1.price + leg2.price;
  const times = estimateTimes(h1 + h2, transferMin);

  let score = cand.score;
  if (priority === "value") score += 5;
  if (priority === "time") score += 30 - totalHours * 2;

  const evidence = [buildTransferEvidence(fromName, toName, hub, cand.km1, cand.km2)];

  const leg1Links = buildLegBookingLinks(fromSt, hub, date, "第1段");
  const leg2Links = buildLegBookingLinks(hub, toSt, date, "第2段");

  return {
    id: `transfer-${hub.telecode}`,
    type: "transfer",
    title: `经 ${hub.name} 中转`,
    transferCity: hub.name,
    legs: [
      {
        from: fromSt.name,
        to: hub.name,
        durationHours: h1,
        price: leg1.price,
        bookingLinks: leg1Links,
      },
      {
        from: hub.name,
        to: toSt.name,
        durationHours: h2,
        price: leg2.price,
        bookingLinks: leg2Links,
      },
    ],
    totalHours,
    totalPrice: price,
    transferMinutes: transferMin,
    departTime: times.dep,
    arriveTime: times.arr,
    description: `${fromSt.name} → ${hub.name}(${formatDuration(h1)}) · ${hub.name}换乘${transferMin}分 · → ${toSt.name}(${formatDuration(h2)}) · 全程${formatDuration(totalHours)} · 二等座约¥${price}`,
    score,
    recommended: false,
    bookingUrl: ctripTrainUrl(fromSt.name, toSt.name, date),
    links: [
      ...leg1Links,
      ...leg2Links,
      ...buildTrainBookingLinks(fromSt.name, toSt.name, date, fromSt, toSt).filter((l) => l.action.includes("中转")),
    ],
    evidence,
    dataSource: leg1.juhe || leg2.juhe ? "聚合数据·12306" : "站码库+区段库",
  };
}

/** 构建去程交通方案（站码库 + 区段库 + 可选12306聚合API） */
export async function buildOptimalTravelTickets(
  request: TripRequest,
  toCityInfo: CityInfo,
): Promise<{
  trainRoutes: TrainRoute[];
  flightOption?: TrainRoute;
  busOption?: TrainRoute;
  recommended: string;
  routeInfo: RouteAnalysis;
  transportEvidence: Evidence[];
}> {
  const fromName = request.departureCity?.trim() || "上海";
  const toName = toCityInfo.name;
  const date = request.startDate;
  const travelers = request.travelers ?? 2;
  const priority = request.priority ?? "value";

  const fromCity = await resolveCityInfo(fromName);
  const routeInfo = await analyzeRoute(fromCity, toCityInfo);
  const { distanceKm } = routeInfo;

  const fromSt = resolveTrainStation(fromName) ?? resolveStation(fromCity.formattedAddress);
  const toSt = resolveTrainStation(toName) ?? resolveStation(toCityInfo.formattedAddress);

  const trainRoutes: TrainRoute[] = [];
  const transportEvidence: Evidence[] = [];

  if (fromSt && toSt) {
    const directKm = haversineKm(fromSt, toSt);
    const likelyNoDirect = directKm > 550;

    if (!likelyNoDirect) {
      const direct = await buildDirectRoute(fromSt, toSt, fromName, toName, date, travelers, directKm);
      if (direct) trainRoutes.push(direct);
    }

    const hubs = getHubStations();
    const hubOpts = {
      priority,
      totalBudget: request.totalBudget,
      travelers,
    };
    const transfers = findTransferHubs(fromSt, toSt, hubs, hubOpts);
    for (const cand of transfers.slice(0, 5)) {
      trainRoutes.push(await buildTransferRoute(fromSt, toSt, fromName, toName, date, travelers, cand, priority));
    }

    if (trainRoutes.length > 0) {
      const totalBudget = request.totalBudget ?? 0;
      const travelCap = totalBudget > 0 ? totalBudget * 0.35 : Infinity;

      const pickBest = (): TrainRoute => {
        const centralHubs = new Set(["武汉", "汉口", "长沙", "长沙南"]);
        const centralRoutes = trainRoutes.filter(
          (r) => r.type === "transfer" && r.transferCity && centralHubs.has(r.transferCity),
        );

        if (totalBudget > 0 || priority === "value") {
          const sorted = [...trainRoutes].sort((a, b) => a.totalPrice - b.totalPrice);
          const affordable = sorted.filter((r) => r.totalPrice <= travelCap);
          // 湘鄂→华东：预算/省钱模式优先武汉/汉口（顺路且票价合理）
          if (centralRoutes.length) {
            const centralBest = [...centralRoutes].sort((a, b) => a.totalPrice - b.totalPrice)[0];
            const cheapest = sorted[0];
            if (
              centralBest &&
              (affordable.some((r) => centralHubs.has(r.transferCity ?? "")) ||
                centralBest.totalPrice <= cheapest.totalPrice * 1.08)
            ) {
              return centralBest;
            }
          }
          if (affordable.length) return affordable[0];
          return sorted[0];
        }
        if (priority === "time") {
          return trainRoutes.reduce((a, b) => (a.totalHours <= b.totalHours ? a : b));
        }
        if (priority === "experience") {
          return trainRoutes.reduce((a, b) => (a.score >= b.score ? a : b));
        }
        return trainRoutes.reduce((a, b) => (a.totalPrice <= b.totalPrice ? a : b));
      };

      const best = pickBest();

      trainRoutes.forEach((r) => { r.recommended = false; });
      best.recommended = true;
      if (!best.title.includes("★")) best.title += " ★ 推荐";
      if (totalBudget > 0 && best.totalPrice > travelCap) {
        best.description += ` · ⚠ 去程约 ¥${best.totalPrice}，占预算 ${Math.round((best.totalPrice / totalBudget) * 100)}%，建议提高总预算或缩短天数`;
      }
      if (best.evidence) transportEvidence.push(...best.evidence);
    }
  }

  let flightOption: TrainRoute | undefined;
  if (distanceKm >= 500) {
    const hours = Math.max(2, Math.round(distanceKm / 700 + 2));
    const price = Math.round((650 + distanceKm * 0.12) * travelers);
    const flightLinks: PlatformLink[] = [
      { platform: "ctrip", label: "携程机票", action: "查航班", url: ctripFlightUrl(fromName, toName, date) },
      { platform: "fliggy", label: "飞猪机票", action: "查航班", url: `https://h5.m.taobao.com/trip/flight/search/index.html?depCityName=${encodeURIComponent(fromName)}&arrCityName=${encodeURIComponent(toName)}&depDate=${encodeURIComponent(date)}` },
    ];
    flightOption = {
      id: "flight",
      type: "direct",
      title: "飞机（备选）",
      legs: [{ from: fromName, to: toName, durationHours: hours, price }],
      totalHours: hours,
      totalPrice: price,
      transferMinutes: 0,
      description: `${fromName} → ${toName} · 约${hours}h（含机场） · 经济舱约 ¥${price}（${travelers}人）`,
      score: priority === "time" && distanceKm >= 800 ? 65 : 35,
      recommended: false,
      bookingUrl: flightLinks[0].url,
      links: flightLinks,
      dataSource: "航线距离估算",
      evidence: [{ claim: "机票价格为距离模型估算，以平台实时为准", sources: [{ name: "模型", value: `直线${Math.round(distanceKm)}km`, fetchedAt: new Date().toISOString() }], confidence: "low" }],
    };
  }

  let busOption: TrainRoute | undefined;
  if (distanceKm < 400) {
    const hours = Math.max(2, Math.round(distanceKm / 60));
    const price = Math.round(distanceKm * 0.35 * travelers);
    busOption = {
      id: "bus",
      type: "direct",
      title: "长途汽车",
      legs: [{ from: fromName, to: toName, durationHours: hours, price }],
      totalHours: hours,
      totalPrice: price,
      transferMinutes: 0,
      description: `${fromName} → ${toName} · 约${hours}h · ¥${price}`,
      score: distanceKm < 200 ? 50 : 28,
      recommended: false,
      bookingUrl: `https://bus.ctrip.com/bus/search?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&date=${encodeURIComponent(date)}`,
      links: [{ platform: "ctrip", label: "携程汽车票", action: "购票", url: `https://bus.ctrip.com/bus/search?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&date=${encodeURIComponent(date)}` }],
      dataSource: "距离估算",
    };
  }

  const recommended = trainRoutes.find((r) => r.recommended)?.title ?? trainRoutes[0]?.title ?? "暂无铁路方案";

  return { trainRoutes, flightOption, busOption, recommended, routeInfo, transportEvidence };
}
