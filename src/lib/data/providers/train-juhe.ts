import type { Evidence, SeatPref } from "@/lib/types";
import { stationQueryNames, type RailStation } from "../../data/station-db";

export interface TrainSegment {
  trainNo?: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  priceSecond: number;
  seatType: string;
  ticketLeft?: string;
}

export interface TrainQueryResult {
  direct: TrainSegment[];
  source: string;
  fetchedAt: string;
  queriedFrom?: string;
  queriedTo?: string;
}

type JuheTrainRow = {
  train_no?: string;
  departure_station?: string;
  arrival_station?: string;
  departure_time?: string;
  arrival_time?: string;
  run_time?: string;
  prices?: Array<{ seat_type?: string; price?: string; num?: string }>;
};

function getJuheKey(): string | null {
  return process.env.JUHE_TRAIN_KEY?.trim() || null;
}

function parseDuration(runTime: string): number {
  const [rh, rm] = (runTime ?? "0:0").split(":").map(Number);
  return (rh || 0) * 60 + (rm || 0);
}

function pickSeatPrice(
  prices: JuheTrainRow["prices"],
  seatPref: SeatPref = "second",
): NonNullable<JuheTrainRow["prices"]>[number] | null {
  if (!prices?.length) return null;
  const withPrice = prices.filter((p) => parseFloat(p.price ?? "0") > 0);
  if (!withPrice.length) return null;

  const match = (patterns: RegExp[]) =>
    withPrice.find((p) => patterns.some((re) => re.test(p.seat_type ?? "")));

  if (seatPref === "first") {
    return match([/一等/, /商务/, /软卧/, /动卧/]) ?? match([/二等/, /硬座/]) ?? withPrice[0];
  }
  if (seatPref === "second") {
    return match([/二等/, /硬座/, /无座/]) ?? match([/一等/]) ?? withPrice[0];
  }
  return [...withPrice].sort((a, b) => parseFloat(a.price ?? "0") - parseFloat(b.price ?? "0"))[0];
}

function mapJuheRow(
  t: JuheTrainRow,
  fromStation: string,
  toStation: string,
  seatPref: SeatPref = "second",
): TrainSegment | null {
  const seat = pickSeatPrice(t.prices, seatPref);
  const priceSecond = parseFloat(seat?.price ?? "0") || 0;
  if (priceSecond <= 0 || !t.departure_time || !t.arrival_time) return null;

  return {
    trainNo: t.train_no,
    from: t.departure_station ?? fromStation,
    to: t.arrival_station ?? toStation,
    departTime: t.departure_time,
    arriveTime: t.arrival_time,
    durationMinutes: parseDuration(t.run_time ?? "0:0"),
    priceSecond,
    seatType: seat?.seat_type ?? "二等座",
    ticketLeft: seat?.num,
  };
}

async function fetchJuheOnce(
  fromStation: string,
  toStation: string,
  date: string,
  seatPref: SeatPref = "second",
): Promise<TrainQueryResult | null> {
  const key = getJuheKey();
  if (!key) return null;

  const url = new URL("https://apis.juhe.cn/fapigw/train/query");
  url.searchParams.set("key", key);
  url.searchParams.set("departure", fromStation);
  url.searchParams.set("arrival", toStation);
  url.searchParams.set("date", date);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      error_code?: number;
      result?: { list?: JuheTrainRow[] };
    };

    if (data.error_code !== 0 || !data.result?.list?.length) return null;

    const direct = data.result.list
      .map((t) => mapJuheRow(t, fromStation, toStation, seatPref))
      .filter((t): t is TrainSegment => t != null)
      .sort((a, b) => a.priceSecond - b.priceSecond || a.durationMinutes - b.durationMinutes);

    if (!direct.length) return null;

    return {
      direct,
      source: "聚合数据·12306",
      fetchedAt: new Date().toISOString(),
      queriedFrom: fromStation,
      queriedTo: toStation,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 单对站名查询 */
export async function queryJuheTrains(
  fromStation: string,
  toStation: string,
  date: string,
  seatPref: SeatPref = "second",
): Promise<TrainQueryResult | null> {
  try {
    return await fetchJuheOnce(fromStation, toStation, date, seatPref);
  } catch {
    return null;
  }
}

/** 多站名变体查询（张家界/张家界西 等逐个试） */
export async function queryJuheTrainsMulti(
  fromSt: RailStation,
  toSt: RailStation,
  date: string,
  seatPref: SeatPref = "second",
): Promise<TrainQueryResult | null> {
  const fromNames = stationQueryNames(fromSt);
  const toNames = stationQueryNames(toSt);

  for (const from of fromNames) {
    for (const to of toNames) {
      const result = await queryJuheTrains(from, to, date, seatPref);
      if (result) return result;
    }
  }
  return null;
}

/** 区段参考价按席别调整 */
export function segmentPriceForSeat(basePrice: number, seatPref: SeatPref = "second"): number {
  if (seatPref === "first") return Math.round(basePrice * 1.65);
  return basePrice;
}

export function isTrainLegVerified(juhe?: TrainQueryResult | null): boolean {
  return Boolean(juhe?.direct?.length && juhe.direct[0].priceSecond > 0);
}

export function juheEvidence(result: TrainQueryResult, from: string, to: string): Evidence {
  const top = result.direct[0];
  const routeLabel =
    result.queriedFrom && result.queriedTo
      ? `${result.queriedFrom}→${result.queriedTo}`
      : `${from}→${to}`;
  return {
    claim: top?.trainNo
      ? `12306 查到 ${routeLabel} ${top.trainNo}，${top.departTime} 发，${top.seatType} ¥${top.priceSecond}/人`
      : `已查询 ${routeLabel} 当日可售车次`,
    sources: result.direct.slice(0, 4).map((t) => ({
      name: result.source,
      value: `${t.trainNo ?? "车次"} ${t.departTime}-${t.arriveTime} ${t.seatType} ¥${t.priceSecond}${t.ticketLeft ? ` 余${t.ticketLeft}` : ""}`,
      fetchedAt: result.fetchedAt,
    })),
    confidence: "high",
  };
}

export function hasJuheKey(): boolean {
  return Boolean(getJuheKey());
}
