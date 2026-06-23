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
}

export interface TrainQueryResult {
  direct: TrainSegment[];
  source: string;
  fetchedAt: string;
}

function getJuheKey(): string | null {
  return process.env.JUHE_TRAIN_KEY?.trim() || null;
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
      reason?: string;
      result?: {
        list?: Array<{
          train_no?: string;
          departure_station?: string;
          arrival_station?: string;
          departure_time?: string;
          arrival_time?: string;
          run_time?: string;
          prices?: Array<{ seat_type?: string; price?: string }>;
        }>;
      };
    };

    if (data.error_code !== 0 || !data.result?.list?.length) return null;

    const direct: TrainSegment[] = data.result.list.slice(0, 8).map((t) => {
      const second = t.prices?.find((p) => p.seat_type?.includes("二等")) ?? t.prices?.[0];
      const [rh, rm] = (t.run_time ?? "0:0").split(":").map(Number);
      return {
        trainNo: t.train_no,
        from: t.departure_station ?? fromStation,
        to: t.arrival_station ?? toStation,
        departTime: t.departure_time ?? "",
        arriveTime: t.arrival_time ?? "",
        durationMinutes: (rh || 0) * 60 + (rm || 0),
        priceSecond: parseFloat(second?.price ?? "0") || 0,
        seatType: second?.seat_type ?? "二等座",
      };
    });

    return { direct, source: "聚合数据·12306", fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

export function juheEvidence(result: TrainQueryResult, from: string, to: string): Evidence {
  const top = result.direct[0];
  return {
    claim: top?.trainNo
      ? `查到直达车次 ${top.trainNo}，${top.departTime} 发`
      : `已查询 ${from}→${to} 当日车次`,
    sources: result.direct.slice(0, 3).map((t) => ({
      name: result.source,
      value: `${t.trainNo ?? "车次"} ${t.departTime}-${t.arriveTime} ${t.seatType} ¥${t.priceSecond}`,
      fetchedAt: result.fetchedAt,
    })),
    confidence: "high",
  };
}
