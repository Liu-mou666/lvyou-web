import { nameSimilarity } from "./html-parse";
import type { CtripSession } from "./ctrip-session";

export interface CtripHotelHit {
  hotelId?: number;
  name: string;
  price: number;
}

function formatYmd(d: string): string {
  return d.replace(/-/g, "");
}

function formatSlash(d: string): string {
  return d.replace(/-/g, "/");
}

function buildHotelListBody(
  cityId: number,
  keyword: string,
  checkIn: string,
  checkOut: string,
  session: CtripSession,
) {
  return {
    hotelIdFilter: { hotelAldyShown: [] as string[] },
    destination: {
      type: 1,
      geo: { cityId, countryId: 1 },
      keyword: { word: keyword },
    },
    date: {
      dateType: 1,
      dateInfo: {
        checkInDate: formatYmd(checkIn),
        checkOutDate: formatYmd(checkOut),
      },
    },
    filters: [] as unknown[],
    extraFilter: { childInfoItems: [] as unknown[], sessionId: "" },
    paging: { pageCode: "102002", pageIndex: 1, pageSize: 15 },
    roomQuantity: 1,
    recommend: { nearbyHotHotel: {} },
    genk: true,
    residenceCode: "CN",
    head: {
      platform: "PC",
      cid: session.cid,
      cver: "hotels",
      bu: "HBU",
      group: "ctrip",
      aid: "",
      sid: "",
      ouid: "",
      locale: "zh-CN",
      timezone: "8",
      currency: "CNY",
      pageId: "102002",
      vid: session.vid,
      guid: session.guid,
      isSSR: false,
      extension: [
        { name: "cityId", value: String(cityId) },
        { name: "checkIn", value: formatSlash(checkIn) },
        { name: "checkOut", value: formatSlash(checkOut) },
        { name: "region", value: "CN" },
      ],
    },
    ServerData: "",
  };
}

function extractHotels(json: unknown): CtripHotelHit[] {
  const hits: CtripHotelHit[] = [];
  const root = json as Record<string, unknown>;
  const list =
    (root.data as Record<string, unknown> | undefined)?.hotelList ??
    (root.Response as Record<string, unknown> | undefined)?.hotelList;

  if (!Array.isArray(list)) return hits;

  for (const item of list) {
    const rec = item as Record<string, unknown>;
    const info = (rec.hotelInfo ?? rec) as Record<string, unknown>;
    const nameInfo = info.nameInfo as Record<string, unknown> | undefined;
    const name = (nameInfo?.name ?? info.hotelName ?? info.name) as string | undefined;
    if (!name) continue;

    const summary = info.summary as Record<string, unknown> | undefined;
    const hotelId = (summary?.hotelId ?? info.hotelId) as number | undefined;

    const priceInfo = (info.priceInfo ?? rec.priceInfo ?? info.minPriceInfo) as
      | Record<string, unknown>
      | undefined;
    const priceRaw =
      priceInfo?.price ??
      priceInfo?.minPrice ??
      info.minPrice ??
      rec.minPrice ??
      rec.price;
    const price = typeof priceRaw === "number" ? priceRaw : parseFloat(String(priceRaw ?? "0"));
    if (price >= 30 && price <= 20000) {
      hits.push({ hotelId, name, price: Math.round(price) });
    }
  }
  return hits;
}

const SOA_URL = "https://m.ctrip.com/restapi/soa2/31454/json/fetchHotelList";

/** 直连携程酒店 SOA（需有效 session Cookie，绕过页面验证码） */
export async function fetchCtripHotelsSoa(
  cityId: number,
  keyword: string,
  checkIn: string,
  checkOut: string,
  session: CtripSession,
): Promise<CtripHotelHit[]> {
  const body = buildHotelListBody(cityId, keyword, checkIn, checkOut, session);

  const res = await fetch(SOA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://hotels.ctrip.com",
      Referer: "https://hotels.ctrip.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Cookie: session.cookieHeader,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const json = (await res.json()) as unknown;
  return extractHotels(json);
}

export function pickBestCtripHotel(hits: CtripHotelHit[], keyword: string): CtripHotelHit | null {
  if (hits.length === 0) return null;
  const scored = hits.map((h) => ({
    h,
    score: nameSimilarity(keyword, h.name),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.h.price - b.h.price;
  });
  const best = scored[0];
  if (best.score < 0.25 && hits.length > 1) {
    // 关键词太弱时取最低价
    return [...hits].sort((a, b) => a.price - b.price)[0];
  }
  return best.score >= 0.2 ? best.h : null;
}

/** 门票搜索 SOA */
export async function fetchCtripTicketsSoa(
  cityId: number,
  keyword: string,
  session: CtripSession,
): Promise<{ name: string; price: number }[]> {
  const body = {
    keyword,
    districtId: cityId,
    index: 1,
    count: 15,
    sortType: 1,
    head: {
      platform: "H5",
      cid: session.cid,
      cver: "1.0",
      bu: "TTD",
      group: "ctrip",
      locale: "zh-CN",
      currency: "CNY",
      vid: session.vid,
      guid: session.guid,
    },
  };

  const res = await fetch("https://m.ctrip.com/restapi/soa2/12530/json/searchPoi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://m.ctrip.com",
      Referer: "https://m.ctrip.com/",
      Cookie: session.cookieHeader,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const json = (await res.json()) as Record<string, unknown>;
  const list = (json.data as Record<string, unknown> | undefined)?.poiList;
  if (!Array.isArray(list)) return [];

  const out: { name: string; price: number }[] = [];
  for (const item of list) {
    const rec = item as Record<string, unknown>;
    const name = (rec.poiName ?? rec.name) as string | undefined;
    const priceRaw = rec.price ?? rec.minPrice ?? rec.marketPrice;
    const price = typeof priceRaw === "number" ? priceRaw : parseFloat(String(priceRaw ?? "0"));
    if (name && price >= 0 && price <= 5000) {
      out.push({ name, price: Math.round(price) });
    }
  }
  return out;
}
