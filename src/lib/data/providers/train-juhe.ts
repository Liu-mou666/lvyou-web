import type { Evidence } from "@/lib/types";

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

function mapJuheRow(t: JuheTrainRow, fromStation: string, toStation: string): TrainSegment | null {
  const second =
    t.prices?.find((p) => p.seat_type?.includes("二等")) ??
    t.prices?.find((p) => p.seat_type?.includes("硬座")) ??
    t.prices?.[0];
  const priceSecond = parseFloat(second?.price ?? "0") || 0;
  if (priceSecond <= 0 || !t.departure_time || !t.arrival_time) return null;

  return {
    trainNo: t.train_no,
    from: t.departure_station ?? fromStation,
    to: t.arrival_station ?? toStation,
    departTime: t.departure_time,
    arriveTime: t.arrival_time,
    durationMinutes: parseDuration(t.run_time ?? "0:0"),
    priceSecond,
    seatType: second?.seat_type ?? "二等座",
    ticketLeft: second?.num,
  };
}

/** 聚合数据火车票 API（配置 JUHE_TRAIN_KEY 后启用真实车次） */
export async function queryJuheTrains(
  fromStation: string,
  toStation: string,
  date: string,
): Promise<TrainQueryResult | null> {
  const key = getJuheKey();
  if (!key) return null;

  try {
    const url = new URL("https://apis.juhe.cn/fapigw/train/query");
    url.searchParams.set("key", key);
    url.searchParams.set("departure", fromStation);
    url.searchParams.set("arrival", toStation);
    url.searchParams.set("date", date);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      error_code?: number;
      result?: { list?: JuheTrainRow[] };
    };

    if (data.error_code !== 0 || !data.result?.list?.length) return null;

    const direct = data.result.list
      .map((t) => mapJuheRow(t, fromStation, toStation))
      .filter((t): t is TrainSegment => t != null)
      .sort((a, b) => a.priceSecond - b.priceSecond);

    if (!direct.length) return null;

    return { direct, source: "聚合数据·12306", fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export function isTrainLegVerified(juhe?: TrainQueryResult | null): boolean {
  return Boolean(juhe?.direct?.length && juhe.direct[0].priceSecond > 0);
}

export function juheEvidence(result: TrainQueryResult, from: string, to: string): Evidence {
  const top = result.direct[0];
  return {
    claim: top?.trainNo
      ? `12306 数据源查到 ${top.trainNo}，${top.departTime} 发，${top.seatType} ¥${top.priceSecond}/人`
      : `已查询 ${from}→${to} 当日可售车次`,
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
