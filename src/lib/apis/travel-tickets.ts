import { resolveCityInfo, type CityInfo } from "./city-resolver";
import { buildTrainRecommendReason } from "../engine/recommend-text";
import { hasJuheKey, isTrainLegVerified, juheEvidence, queryJuheTrainsMulti } from "../data/providers/train-juhe";
import {
  ctripFlightUrl,
  ctripTrainUrl,
  getHubStations,
  haversineKm,
  listStationsForCity,
  resolveStation,
  stationQueryNames,
  type RailStation,
} from "../data/station-db";
import {
  buildTrainBookingLinks,
  buildLegBookingLinks,
  findTransferHubs,
  formatDuration,
} from "../engine/transport-graph";
import type { Evidence, PlatformLink, TrainRoute, TripRequest } from "../types";
import { fetchDrivingRoute } from "./amap";

interface RouteAnalysis {
  distanceKm: number;
  driveHours: number;
  driveCost: number;
}

interface LegResult {
  hours: number;
  price: number;
  juhe: Awaited<ReturnType<typeof queryJuheTrainsMulti>>;
  trainNo?: string;
  departTime?: string;
  arriveTime?: string;
  fromSt: RailStation;
  toSt: RailStation;
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

async function legFromJuheMulti(
  fromCandidates: RailStation[],
  toCandidates: RailStation[],
  date: string,
  travelers: number,
): Promise<LegResult | null> {
  for (const fromSt of fromCandidates) {
    for (const toSt of toCandidates) {
      const juhe = await queryJuheTrainsMulti(fromSt, toSt, date);
      if (!isTrainLegVerified(juhe)) continue;

      const best = juhe!.direct[0];
      return {
        hours: Math.round((best.durationMinutes / 60) * 10) / 10,
        price: Math.round(best.priceSecond * travelers),
        juhe,
        trainNo: best.trainNo,
        departTime: best.departTime,
        arriveTime: best.arriveTime,
        fromSt,
        toSt,
      };
    }
  }
  return null;
}

function stationLabelList(stations: RailStation[]): string {
  return stations.map((s) => s.name).join("、");
}

function buildSearchOnlyRoute(
  fromCandidates: RailStation[],
  toCandidates: RailStation[],
  date: string,
  reason: string,
): TrainRoute {
  const fromSt = fromCandidates[0];
  const toSt = toCandidates[0];
  const links = buildTrainBookingLinks(fromSt.name, toSt.name, date, fromSt, toSt);
  const triedFrom = fromCandidates.flatMap((s) => stationQueryNames(s)).join("、");
  const triedTo = toCandidates.flatMap((s) => stationQueryNames(s)).join("、");

  return {
    id: "search-only",
    type: "direct",
    title: "请自行查票",
    legs: [{ from: fromSt.name, to: toSt.name, durationHours: 0, price: 0 }],
    totalHours: 0,
    totalPrice: 0,
    transferMinutes: 0,
    description: `${reason}。已尝试出发：${triedFrom}；到达：${triedTo}`,
    score: 0,
    recommended: false,
    verified: false,
    bookingUrl: ctripTrainUrl(fromSt.name, toSt.name, date),
    links,
    dataSource: "查票链接",
    priceNote: "未展示估算票价，请通过下方链接在 12306/携程 查看当日余票与实价",
    evidence: [{
      claim: reason,
      sources: [{ name: "说明", value: hasJuheKey() ? "12306 数据源未返回可售车次" : "未配置 JUHE_TRAIN_KEY", fetchedAt: new Date().toISOString() }],
      confidence: "medium",
    }],
  };
}

async function buildDirectRoute(
  fromCandidates: RailStation[],
  toCandidates: RailStation[],
  date: string,
  travelers: number,
): Promise<TrainRoute | null> {
  const leg = await legFromJuheMulti(fromCandidates, toCandidates, date, travelers);
  if (!leg) return null;

  const best = leg.juhe!.direct[0];
  const evidence: Evidence[] = [juheEvidence(leg.juhe!, leg.fromSt.name, leg.toSt.name)];

  return {
    id: `direct-${leg.fromSt.telecode}-${leg.toSt.telecode}`,
    type: "direct",
    title: best.trainNo ? `直达 ${best.trainNo}（${leg.fromSt.name}→${leg.toSt.name}）` : `直达（${leg.fromSt.name}→${leg.toSt.name}）`,
    legs: [{ from: leg.fromSt.name, to: leg.toSt.name, durationHours: leg.hours, price: leg.price }],
    totalHours: leg.hours,
    totalPrice: leg.price,
    transferMinutes: 0,
    departTime: leg.departTime,
    arriveTime: leg.arriveTime,
    description: `${leg.fromSt.name} → ${leg.toSt.name} · ${formatDuration(leg.hours)} · ${best.seatType} ¥${leg.price}（${travelers}人·12306 实时）`,
    score: 60,
    recommended: false,
    verified: true,
    verifiedAt: leg.juhe!.fetchedAt,
    bookingUrl: ctripTrainUrl(leg.fromSt.name, leg.toSt.name, date),
    links: buildTrainBookingLinks(leg.fromSt.name, leg.toSt.name, date, leg.fromSt, leg.toSt),
    evidence,
    trainNumbers: leg.juhe!.direct.map((t) => t.trainNo).filter(Boolean) as string[],
    dataSource: leg.juhe!.source,
    priceNote: `实际查票站：${leg.juhe!.queriedFrom ?? leg.fromSt.name} → ${leg.juhe!.queriedTo ?? leg.toSt.name}`,
  };
}

async function buildTransferRoute(
  fromCandidates: RailStation[],
  toCandidates: RailStation[],
  date: string,
  travelers: number,
  cand: ReturnType<typeof findTransferHubs>[0],
  priority: TripRequest["priority"],
): Promise<TrainRoute | null> {
  const hub = cand.hub;
  const leg1 = await legFromJuheMulti(fromCandidates, [hub], date, travelers);
  const leg2 = await legFromJuheMulti([hub], toCandidates, date, travelers);
  if (!leg1 || !leg2) return null;

  const transferMin = hub.name.includes("虹桥") ? 35 : hub.name.includes("上海") ? 40 : 45;
  const totalHours = Math.round((leg1.hours + leg2.hours + transferMin / 60) * 10) / 10;
  const price = leg1.price + leg2.price;

  let score = cand.score;
  if (priority === "value") score += 5;
  if (priority === "time") score += 30 - totalHours * 2;

  const leg1Links = buildLegBookingLinks(leg1.fromSt, hub, date, "第1段");
  const leg2Links = buildLegBookingLinks(hub, leg2.toSt, date, "第2段");
  const evidence: Evidence[] = [
    juheEvidence(leg1.juhe!, leg1.fromSt.name, hub.name),
    juheEvidence(leg2.juhe!, hub.name, leg2.toSt.name),
  ];

  const t1 = leg1.juhe!.direct[0];
  const t2 = leg2.juhe!.direct[0];

  return {
    id: `transfer-${hub.telecode}`,
    type: "transfer",
    title: `经 ${hub.name} 中转`,
    transferCity: hub.name,
    legs: [
      { from: leg1.fromSt.name, to: hub.name, durationHours: leg1.hours, price: leg1.price, bookingLinks: leg1Links },
      { from: hub.name, to: leg2.toSt.name, durationHours: leg2.hours, price: leg2.price, bookingLinks: leg2Links },
    ],
    totalHours,
    totalPrice: price,
    transferMinutes: transferMin,
    departTime: leg1.departTime,
    arriveTime: leg2.arriveTime,
    description: `${leg1.fromSt.name} ${t1.trainNo ?? ""}→${hub.name}(${formatDuration(leg1.hours)}) · ${hub.name}换乘${transferMin}分 · ${leg2.toSt.name} ${t2.trainNo ?? ""}(${formatDuration(leg2.hours)}) · 全程${formatDuration(totalHours)} · 二等座 ¥${price}（${travelers}人·12306 实时）`,
    score,
    recommended: false,
    verified: true,
    verifiedAt: leg2.juhe!.fetchedAt,
    bookingUrl: ctripTrainUrl(leg1.fromSt.name, leg2.toSt.name, date),
    links: [
      ...leg1Links,
      ...leg2Links,
      ...buildTrainBookingLinks(leg1.fromSt.name, leg2.toSt.name, date, leg1.fromSt, leg2.toSt).filter((l) => l.action.includes("中转")),
    ],
    evidence,
    trainNumbers: [t1.trainNo, t2.trainNo].filter(Boolean) as string[],
    dataSource: leg1.juhe!.source,
    priceNote: "两段均已验证有列次，换乘时间请预留充足",
  };
}

/** 构建去程交通方案（仅展示 12306 数据源验证有票方案） */
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

  const fromCandidates = listStationsForCity(fromName);
  const toCandidates = listStationsForCity(toName);
  if (fromCandidates.length === 0) {
    const fb = resolveStation(fromCity.formattedAddress);
    if (fb) fromCandidates.push(fb);
  }
  if (toCandidates.length === 0) {
    const fb = resolveStation(toCityInfo.formattedAddress);
    if (fb) toCandidates.push(fb);
  }

  const fromPrimary = fromCandidates[0];
  const toPrimary = toCandidates[0];

  const trainRoutes: TrainRoute[] = [];
  const transportEvidence: Evidence[] = [];

  if (fromPrimary && toPrimary) {
    const direct = await buildDirectRoute(fromCandidates, toCandidates, date, travelers);
    if (direct) trainRoutes.push(direct);

    const hubs = getHubStations();
    const transfers = findTransferHubs(fromPrimary, toPrimary, hubs, {
      priority,
      totalBudget: request.totalBudget,
      travelers,
    });

    for (const cand of transfers.slice(0, 8)) {
      const route = await buildTransferRoute(fromCandidates, toCandidates, date, travelers, cand, priority);
      if (route) trainRoutes.push(route);
    }

    if (trainRoutes.length === 0) {
      const msg = hasJuheKey()
        ? `12306 数据源未查到 ${stationLabelList(fromCandidates)}→${stationLabelList(toCandidates)} 在 ${date} 的可售车次`
        : "未配置 JUHE_TRAIN_KEY，无法验证余票";
      trainRoutes.push(buildSearchOnlyRoute(fromCandidates, toCandidates, date, msg));
    } else {
      const totalBudget = request.totalBudget ?? 0;
      const travelCap = totalBudget > 0 ? totalBudget * 0.35 : Infinity;
      const verified = trainRoutes.filter((r) => r.verified);

      const pickBest = (): TrainRoute => {
        if (totalBudget > 0 || priority === "value") {
          const sorted = [...verified].sort((a, b) => a.totalPrice - b.totalPrice);
          const affordable = sorted.filter((r) => r.totalPrice <= travelCap);
          if (affordable.length) return affordable[0];
          return sorted[0];
        }
        if (priority === "time") {
          return verified.reduce((a, b) => (a.totalHours <= b.totalHours ? a : b));
        }
        return verified.reduce((a, b) => (a.score >= b.score ? a : b));
      };

      const best = pickBest();
      verified.forEach((r) => {
        r.recommended = false;
        r.recommendReason = buildTrainRecommendReason(r, {
          priority,
          totalBudget,
          verifiedCount: verified.length,
        });
      });
      best.recommended = true;
      if (!best.title.includes("★")) best.title += " ★ 推荐";

      if (totalBudget > 0 && best.totalPrice > travelCap) {
        best.description += ` · ⚠ 去程 ¥${best.totalPrice} 占预算 ${Math.round((best.totalPrice / totalBudget) * 100)}%`;
      }
      if (best.evidence) transportEvidence.push(...best.evidence);
    }
  }

  let flightOption: TrainRoute | undefined;
  if (distanceKm >= 500) {
    const flightLinks: PlatformLink[] = [
      { platform: "ctrip", label: "携程机票", action: "查航班", url: ctripFlightUrl(fromName, toName, date) },
      { platform: "fliggy", label: "飞猪机票", action: "查航班", url: `https://h5.m.taobao.com/trip/flight/search/index.html?depCityName=${encodeURIComponent(fromName)}&arrCityName=${encodeURIComponent(toName)}&depDate=${encodeURIComponent(date)}` },
    ];
    flightOption = {
      id: "flight",
      type: "direct",
      title: "飞机（备选·需自行查价）",
      legs: [{ from: fromName, to: toName, durationHours: 0, price: 0 }],
      totalHours: 0,
      totalPrice: 0,
      transferMinutes: 0,
      description: `${fromName} → ${toName} · 点击下方链接查看 ${date} 当日航班与实价`,
      score: priority === "time" && distanceKm >= 800 ? 65 : 35,
      recommended: false,
      verified: false,
      bookingUrl: flightLinks[0].url,
      links: flightLinks,
      dataSource: "查票链接",
      priceNote: "不展示估算机票价，以携程/飞猪实时为准",
    };
  }

  let busOption: TrainRoute | undefined;
  if (distanceKm < 400) {
    busOption = {
      id: "bus",
      type: "direct",
      title: "长途汽车（需自行查价）",
      legs: [{ from: fromName, to: toName, durationHours: 0, price: 0 }],
      totalHours: 0,
      totalPrice: 0,
      transferMinutes: 0,
      description: `${fromName} → ${toName} · 点击下方携程查 ${date} 当日汽车票`,
      score: distanceKm < 200 ? 50 : 28,
      recommended: false,
      verified: false,
      bookingUrl: `https://bus.ctrip.com/bus/search?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&date=${encodeURIComponent(date)}`,
      links: [{ platform: "ctrip", label: "携程汽车票", action: "购票", url: `https://bus.ctrip.com/bus/search?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&date=${encodeURIComponent(date)}` }],
      dataSource: "查票链接",
      priceNote: "不展示估算票价",
    };
  }

  const recommended = trainRoutes.find((r) => r.recommended)?.title ?? trainRoutes[0]?.title ?? "暂无铁路方案";

  return { trainRoutes, flightOption, busOption, recommended, routeInfo, transportEvidence };
}
