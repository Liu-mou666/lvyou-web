import { resolveCityInfo } from "./city-resolver";
import { fetchPOIDetail, searchPOI } from "./amap";
import { buildOptimalTravelTickets } from "./travel-tickets";
import { lookupPublicTicketHint } from "../engine/public-price-db";
import { ctripTicketSearchUrl, getCtripCityId } from "../data/platform-urls";
import type { PlatformLink, TrainRoute, TripRequest } from "../types";
import { hasJuheKey } from "../data/providers/train-juhe";

export interface TicketPreviewItem {
  name: string;
  pricePerPerson: number;
  confidence: "high" | "medium" | "low" | "none";
  note: string;
  free: boolean;
  links: PlatformLink[];
}

export interface PricePreviewResult {
  trainRoutes: TrainRoute[];
  recommendedTrain?: TrainRoute;
  flightOption?: TrainRoute;
  routeDistanceKm?: number;
  juheConfigured: boolean;
  tickets: TicketPreviewItem[];
  fetchedAt: string;
}

async function previewTicketForName(
  name: string,
  cityName: string,
  adcode: string,
  travelers: number,
  visitDate: string,
): Promise<TicketPreviewItem> {
  const city = cityName.replace(/市$/g, "");
  const ctripCityId = getCtripCityId(adcode);
  const links: PlatformLink[] = [
    {
      platform: "ctrip",
      label: "携程门票",
      action: "查当日售价",
      url: ctripTicketSearchUrl(cityName, name, ctripCityId),
    },
    {
      platform: "fliggy",
      label: "飞猪门票",
      action: "查套餐",
      url: `https://h5.m.taobao.com/trip/poi/search.html?keyword=${encodeURIComponent(name)}`,
    },
  ];

  let pricePerPerson = 0;
  let confidence: TicketPreviewItem["confidence"] = "none";
  let note = "暂无参考价，请点链接查平台实价";
  let free = false;

  const hint = lookupPublicTicketHint(name, cityName, visitDate);
  if (hint) {
    pricePerPerson = hint.resolvedTicket;
    free = hint.resolvedTicket === 0;
    confidence = "medium";
    const season =
      hint.peakTicket && hint.offPeakTicket
        ? `按${hint.resolvedTicket === hint.peakTicket ? "旺季" : "淡季"}`
        : "";
    note = `政府指导价 ${season} ¥${hint.resolvedTicket}/人 · ${hint.note}`;
  }

  try {
    const results = await searchPOI({ keywords: name, city: cityName, types: "110000" });
    const match = results.find((p) => p.name.includes(name) || name.includes(p.name.replace(/景区|公园/g, "")));
    if (match?.id) {
      const detail = await fetchPOIDetail(match.id);
      const cost = parseFloat(detail?.biz_ext?.cost ?? "0") || 0;
      if (cost > 0) {
        pricePerPerson = cost;
        confidence = "high";
        note = `高德收录 ¥${cost}/人`;
        free = false;
      }
      links.unshift({
        platform: "amap",
        label: "高德详情",
        action: "电话·营业时间",
        url: `https://ditu.amap.com/place/${match.id}`,
      });
    }
  } catch {
    /* keep hint */
  }

  if (pricePerPerson > 0 && travelers > 1) {
    note += ` · ${travelers}人约 ¥${pricePerPerson * travelers}`;
  }

  return { name, pricePerPerson, confidence, note, free, links };
}

export async function buildPricePreview(input: {
  departureCity: string;
  city: string;
  startDate: string;
  travelers: number;
  priority?: TripRequest["priority"];
  totalBudget?: number;
  departureStationMode?: TripRequest["departureStationMode"];
  mustVisit?: string[];
  preferDirectTrain?: boolean;
  seatPref?: TripRequest["seatPref"];
  maxHotelPerNight?: number;
}): Promise<PricePreviewResult> {
  const run = async (): Promise<PricePreviewResult> => {
  const toCityInfo = await resolveCityInfo(input.city.trim());
  const req: TripRequest = {
    city: input.city.trim(),
    departureCity: input.departureCity.trim(),
    days: 3,
    style: "mixed",
    pace: "normal",
    budget: "moderate",
    startDate: input.startDate,
    travelers: input.travelers,
    priority: input.priority ?? "value",
    totalBudget: input.totalBudget ?? 0,
    departureStationMode: input.departureStationMode ?? "auto",
    preferDirectTrain: input.preferDirectTrain ?? false,
    seatPref: input.seatPref ?? "second",
    maxHotelPerNight: input.maxHotelPerNight ?? 0,
  };

  const transport = await buildOptimalTravelTickets(req, toCityInfo, { preview: true });
  let trainRoutes = transport.trainRoutes;

  if (input.preferDirectTrain) {
    const directOnly = trainRoutes.filter((r) => r.type === "direct" && r.verified);
    if (directOnly.length > 0) {
      trainRoutes = directOnly;
      directOnly.forEach((r) => {
        r.recommended = false;
      });
      const best = directOnly.reduce((a, b) => (a.totalPrice <= b.totalPrice ? a : b));
      best.recommended = true;
    }
  }

  const recommendedTrain = trainRoutes.find((r) => r.recommended) ?? trainRoutes[0];

  const mustNames = [...new Set(input.mustVisit?.filter(Boolean) ?? [])];
  const tickets = await Promise.all(
    mustNames.map((name) =>
      previewTicketForName(name, toCityInfo.name, toCityInfo.adcode, input.travelers, input.startDate),
    ),
  );

  return {
    trainRoutes,
    recommendedTrain,
    flightOption: transport.flightOption,
    routeDistanceKm: transport.routeInfo.distanceKm,
    juheConfigured: hasJuheKey(),
    tickets,
    fetchedAt: new Date().toISOString(),
  };
  };

  const timeoutMs = 14_000;
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("查价超时，请点刷新或先生成行程")), timeoutMs);
  });

  return Promise.race([run(), timeout]);
}
