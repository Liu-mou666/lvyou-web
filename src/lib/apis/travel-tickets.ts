import { resolveCityInfo, type CityInfo } from "./city-resolver";
import { buildTrainRecommendReason } from "../engine/recommend-text";
import { hasJuheKey, isTrainLegVerified, juheEvidence, queryJuheTrainsMulti, segmentPriceForSeat } from "../data/providers/train-juhe";
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
  buildTransferEvidence,
  findTransferHubs,
  formatDuration,
  lookupSegment,
  type TransferCandidate,
} from "../engine/transport-graph";
import type { Evidence, PlatformLink, SeatPref, TrainRoute, TripRequest } from "../types";
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
  seatPref: SeatPref = "second",
  preview = false,
): Promise<LegResult | null> {
  const fromList = preview ? fromCandidates.slice(0, 1) : fromCandidates;
  const toList = preview ? toCandidates.slice(0, 1) : toCandidates;
  for (const fromSt of fromList) {
    for (const toSt of toList) {
      const juhe = await queryJuheTrainsMulti(fromSt, toSt, date, seatPref);
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
  const seen = new Set<string>();
  const names: string[] = [];
  for (const s of stations) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      names.push(s.name);
    }
  }
  return names.join("、");
}

interface ResolvedLeg {
  from: RailStation;
  to: RailStation;
  hours: number;
  price: number;
  juhe?: LegResult["juhe"];
  trainNo?: string;
  departTime?: string;
  arriveTime?: string;
  source: "juhe" | "segment";
}

/** 优先 12306 验证，失败则用铁路区段参考库 */
async function resolveLeg(
  fromCandidates: RailStation[],
  toCandidates: RailStation[],
  date: string,
  travelers: number,
  seatPref: SeatPref = "second",
  preview = false,
): Promise<ResolvedLeg | null> {
  const juhe = await legFromJuheMulti(fromCandidates, toCandidates, date, travelers, seatPref, preview);
  if (juhe) {
    const best = juhe.juhe!.direct[0];
    return {
      from: juhe.fromSt,
      to: juhe.toSt,
      hours: juhe.hours,
      price: juhe.price,
      juhe: juhe.juhe,
      trainNo: best.trainNo,
      departTime: juhe.departTime,
      arriveTime: juhe.arriveTime,
      source: "juhe",
    };
  }

  let best: ResolvedLeg | null = null;
  for (const fromSt of fromCandidates) {
    for (const toSt of toCandidates) {
      const seg = lookupSegment(fromSt.name, toSt.name);
      if (!seg) continue;
      const price = Math.round(segmentPriceForSeat(seg.pricePerPerson, seatPref) * travelers);
      const candidate: ResolvedLeg = {
        from: fromSt,
        to: toSt,
        hours: seg.hours,
        price,
        source: "segment",
      };
      if (!best || price < best.price) best = candidate;
    }
  }
  return best;
}

function transferMinutesForHub(hubName: string): number {
  if (hubName.includes("虹桥")) return 35;
  if (hubName.includes("上海")) return 40;
  return 45;
}

function assembleTransferRoute(
  leg1: ResolvedLeg,
  leg2: ResolvedLeg,
  hub: RailStation,
  date: string,
  travelers: number,
  cand: TransferCandidate,
  priority: TripRequest["priority"],
  fromName: string,
  toName: string,
): TrainRoute {
  const transferMin = transferMinutesForHub(hub.name);
  const totalHours = Math.round((leg1.hours + leg2.hours + transferMin / 60) * 10) / 10;
  const price = leg1.price + leg2.price;
  const fullyVerified = leg1.source === "juhe" && leg2.source === "juhe";
  const hasSegment = leg1.source === "segment" || leg2.source === "segment";

  let score = cand.score;
  if (priority === "value") score += 5;
  if (priority === "time") score += 30 - totalHours * 2;
  if (hasSegment && !fullyVerified) score -= 8;

  const leg1Links = buildLegBookingLinks(leg1.from, hub, date, "第1段");
  const leg2Links = buildLegBookingLinks(hub, leg2.to, date, "第2段");
  const evidence: Evidence[] = [
    buildTransferEvidence(fromName, toName, hub, cand.km1, cand.km2),
  ];
  if (leg1.juhe) evidence.push(juheEvidence(leg1.juhe, leg1.from.name, hub.name));
  if (leg2.juhe) evidence.push(juheEvidence(leg2.juhe, hub.name, leg2.to.name));

  const leg1Label =
    leg1.source === "juhe" && leg1.trainNo
      ? `${leg1.from.name} ${leg1.trainNo}→${hub.name}(${formatDuration(leg1.hours)})`
      : `${leg1.from.name}→${hub.name}(${formatDuration(leg1.hours)}·参考)`;
  const leg2Label =
    leg2.source === "juhe" && leg2.trainNo
      ? `${hub.name} ${leg2.trainNo}→${leg2.to.name}(${formatDuration(leg2.hours)})`
      : `${hub.name}→${leg2.to.name}(${formatDuration(leg2.hours)}·参考)`;

  const priceTag = fullyVerified
    ? `${travelers}人·12306 实时`
    : hasSegment
      ? `${travelers}人·区段参考价`
      : `${travelers}人`;

  return {
    id: fullyVerified ? `transfer-${hub.telecode}` : `segment-transfer-${hub.telecode}`,
    type: "transfer",
    title: fullyVerified ? `经 ${hub.name} 中转` : `经 ${hub.name} 中转（参考价）`,
    transferCity: hub.name,
    legs: [
      {
        from: leg1.from.name,
        to: hub.name,
        durationHours: leg1.hours,
        price: leg1.price,
        bookingLinks: leg1Links,
      },
      {
        from: hub.name,
        to: leg2.to.name,
        durationHours: leg2.hours,
        price: leg2.price,
        bookingLinks: leg2Links,
      },
    ],
    totalHours,
    totalPrice: price,
    transferMinutes: transferMin,
    departTime: leg1.departTime,
    arriveTime: leg2.arriveTime,
    description: `${leg1Label} · ${hub.name}换乘${transferMin}分 · ${leg2Label} · 全程${formatDuration(totalHours)} · 二等座 ¥${price}（${priceTag}）`,
    score,
    recommended: false,
    verified: fullyVerified,
    verifiedAt: fullyVerified ? leg2.juhe?.fetchedAt : undefined,
    bookingUrl: ctripTrainUrl(leg1.from.name, leg2.to.name, date),
    links: [
      ...leg1Links,
      ...leg2Links,
      ...buildTrainBookingLinks(leg1.from.name, leg2.to.name, date, leg1.from, leg2.to).filter((l) =>
        l.action.includes("中转"),
      ),
    ],
    evidence,
    trainNumbers: [leg1.trainNo, leg2.trainNo].filter(Boolean) as string[],
    dataSource: fullyVerified ? leg1.juhe!.source : "铁路区段参考价库",
    priceNote: fullyVerified
      ? "两段均已验证有列次，换乘时间请预留充足"
      : "远期或未放票：价格为常见区段参考，分段链接可查实价与中转方案",
  };
}

export function buildSearchOnlyRoute(
  fromCandidates: RailStation[],
  toCandidates: RailStation[],
  date: string,
  reason: string,
): TrainRoute {
  const fromSt = fromCandidates[0];
  const toSt = toCandidates[0];
  const links = buildTrainBookingLinks(fromSt.name, toSt.name, date, fromSt, toSt);
  const triedFrom = stationLabelList(fromCandidates);
  const triedTo = stationLabelList(toCandidates);

  return {
    id: "search-only",
    type: "direct",
    title: "请自行查票",
    legs: [{ from: fromSt.name, to: toSt.name, durationHours: 0, price: 0 }],
    totalHours: 0,
    totalPrice: 0,
    transferMinutes: 0,
    description: `${reason}。已尝试站点：${triedFrom} → ${triedTo}。建议点击携程「查车次·中转」查看经武汉/长沙/上海等枢纽方案`,
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
  seatPref: SeatPref = "second",
  preview = false,
): Promise<TrainRoute | null> {
  const leg = await legFromJuheMulti(fromCandidates, toCandidates, date, travelers, seatPref, preview);
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
  cand: TransferCandidate,
  priority: TripRequest["priority"],
  fromName: string,
  toName: string,
  seatPref: SeatPref = "second",
  preview = false,
): Promise<TrainRoute | null> {
  const hub = cand.hub;
  const leg1 = await resolveLeg(fromCandidates, [hub], date, travelers, seatPref, preview);
  const leg2 = await resolveLeg([hub], toCandidates, date, travelers, seatPref, preview);
  if (!leg1 || !leg2) return null;
  return assembleTransferRoute(leg1, leg2, hub, date, travelers, cand, priority, fromName, toName);
}

/** 构建去程交通方案（仅展示 12306 数据源验证有票方案） */
export async function buildOptimalTravelTickets(
  request: TripRequest,
  toCityInfo: CityInfo,
  options?: { preview?: boolean; fromCityInfo?: CityInfo },
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
  const seatPref = request.seatPref ?? "second";

  const fromCity = options?.fromCityInfo ?? (await resolveCityInfo(fromName));
  const routeInfo = options?.preview
    ? (() => {
        const km = haversineKm(fromCity, toCityInfo);
        return { distanceKm: km, driveHours: Math.round(km / 80), driveCost: Math.round(km * 0.8 + 50) };
      })()
    : await analyzeRoute(fromCity, toCityInfo);
  const { distanceKm } = routeInfo;

  const fromCandidates = listStationsForCity(fromName, request.departureStationMode ?? "auto");
  const toCandidates = listStationsForCity(toName, "auto");
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

  /** 预查价：跳过 12306 多站轮询（Vercel 10s 内必返回） */
  if (options?.preview && fromPrimary && toPrimary) {
    const msg = hasJuheKey()
      ? "预查价为提速仅提供查票链接；点「确认并生成行程」后将查 12306 实价"
      : "未配置 JUHE_TRAIN_KEY，请点携程链接查当日车次";
    const searchRoute = buildSearchOnlyRoute(fromCandidates, toCandidates, date, msg);
    searchRoute.recommended = true;
    searchRoute.title = `${fromPrimary.name} → ${toPrimary.name} · 预查价`;
    trainRoutes.push(searchRoute);

    let flightOption: TrainRoute | undefined;
    if (distanceKm >= 500) {
      const flightLinks: PlatformLink[] = [
        { platform: "ctrip", label: "携程机票", action: "查航班", url: ctripFlightUrl(fromName, toName, date) },
      ];
      flightOption = {
        id: "flight",
        type: "direct",
        title: "飞机（备选）",
        legs: [{ from: fromName, to: toName, durationHours: 0, price: 0 }],
        totalHours: 0,
        totalPrice: 0,
        transferMinutes: 0,
        description: `约 ${distanceKm} km · 点击下方查航班`,
        score: 35,
        recommended: false,
        verified: false,
        bookingUrl: flightLinks[0].url,
        links: flightLinks,
        dataSource: "查票链接",
      };
    }

    return {
      trainRoutes,
      flightOption,
      recommended: searchRoute.title,
      routeInfo,
      transportEvidence,
    };
  }

  if (fromPrimary && toPrimary) {
    const preview = options?.preview ?? false;
    const direct = await buildDirectRoute(fromCandidates, toCandidates, date, travelers, seatPref, preview);
    if (direct) trainRoutes.push(direct);

    const transferLimit =
      preview ? (direct?.verified ? 0 : 1) : 5;
    if (transferLimit > 0) {
      const hubs = getHubStations();
      const transfers = findTransferHubs(fromPrimary, toPrimary, hubs, {
        priority,
        totalBudget: request.totalBudget,
        travelers,
      });

      const transferTasks = transfers.slice(0, transferLimit).map((cand) =>
        buildTransferRoute(
          fromCandidates,
          toCandidates,
          date,
          travelers,
          cand,
          priority,
          fromName,
          toName,
          seatPref,
          preview,
        ),
      );
      const transferResults = await Promise.all(transferTasks);
      for (const route of transferResults) {
        if (route) trainRoutes.push(route);
      }
    }

    if (trainRoutes.length === 0) {
      const msg = hasJuheKey()
        ? `12306 未返回 ${date} 当日可售车次（可能尚未放票）`
        : "未配置 JUHE_TRAIN_KEY，无法验证余票";
      trainRoutes.push(buildSearchOnlyRoute(fromCandidates, toCandidates, date, msg));
    } else {
      const totalBudget = request.totalBudget ?? 0;
      const travelCap = totalBudget > 0 ? totalBudget * 0.35 : Infinity;
      const verified = trainRoutes.filter((r) => r.verified);
      const withPrice = trainRoutes.filter((r) => r.totalPrice > 0);
      const candidatePool = request.preferDirectTrain
        ? (verified.length ? verified.filter((r) => r.type === "direct") : withPrice.filter((r) => r.type === "direct"))
        : verified.length
          ? verified
          : withPrice;
      const pool = candidatePool.length > 0 ? candidatePool : trainRoutes.filter((r) => r.id !== "search-only");

      const pickBest = (): TrainRoute => {
        if (totalBudget > 0 || priority === "value") {
          const sorted = [...pool].sort((a, b) => a.totalPrice - b.totalPrice);
          const affordable = sorted.filter((r) => r.totalPrice <= travelCap);
          if (affordable.length) return affordable[0];
          return sorted[0];
        }
        if (priority === "time") {
          return pool.reduce((a, b) => (a.totalHours <= b.totalHours ? a : b));
        }
        return pool.reduce((a, b) => (a.score >= b.score ? a : b));
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
