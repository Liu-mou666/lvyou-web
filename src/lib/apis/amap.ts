import { getAmapKey } from "../config";

const BASE = "https://restapi.amap.com/v3";
const MIN_INTERVAL_MS = 400;
const MAX_RETRIES = 5;

let requestChain: Promise<void> = Promise.resolve();
let lastCallAt = 0;

interface AmapResponse {
  status: string;
  info: string;
  infocode?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(data: AmapResponse): boolean {
  return (
    data.info?.includes("QPS") ||
    data.info?.includes("EXCEEDED") ||
    data.infocode === "10021" ||
    data.infocode === "10022"
  );
}

function isTransientError(data: AmapResponse): boolean {
  return (
    isRateLimitError(data) ||
    data.infocode === "30001" ||
    data.infocode === "30002" ||
    data.infocode === "30003" ||
    data.info?.includes("ENGINE_RESPONSE_DATA_ERROR") ||
    data.info?.includes("UNKNOWN")
  );
}

async function enqueueAmapCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const now = Date.now();
    const wait = MIN_INTERVAL_MS - (now - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  requestChain = run.then(() => undefined, () => undefined);
  return run;
}

export async function amapGet<T extends AmapResponse>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  return enqueueAmapCall(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const url = new URL(`${BASE}${path}`);
      url.searchParams.set("key", getAmapKey());
      url.searchParams.set("output", "json");
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        lastError = new Error(`高德 API 网络错误: ${res.status}`);
        await sleep(800 * (attempt + 1));
        continue;
      }

      const data = (await res.json()) as T;
      if (data.status === "1") return data;

      if (isTransientError(data)) {
        lastError = new Error(`高德 API 暂时不可用，正在重试… (${data.info})`);
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (data.infocode === "10001") {
        throw new Error(
          "高德 Key 无效 (10001)。请确认创建的是「Web 服务」类型 Key，而非「Web 端 JS API」Key，然后更新 .env.local 并重启服务",
        );
      }

      if (data.infocode === "30001") {
        throw new Error(`无法识别该地名，请换更标准的地名（如：杭州、苏州、张家界市）`);
      }

      throw new Error(`高德 API: ${data.info || "请求失败"} (${data.infocode ?? ""})`);
    }

    throw lastError ?? new Error("高德 API 请求失败，请稍后重试");
  });
}

export interface AmapPoi {
  id: string;
  name: string;
  type: string;
  typecode: string;
  address: string;
  location: string;
  tel?: string;
  distance?: string;
  biz_ext?: {
    rating?: string;
    cost?: string;
    open_time?: string;
    meal_ordering?: string;
  };
  photos?: Array<{ url: string }>;
}

export interface AmapPlaceTextResponse extends AmapResponse {
  pois?: AmapPoi[];
  count?: string;
}

export interface AmapPlaceAroundResponse extends AmapResponse {
  pois?: AmapPoi[];
}

export interface AmapWeatherLiveResponse extends AmapResponse {
  lives?: Array<{
    province: string;
    city: string;
    adcode: string;
    weather: string;
    temperature: string;
    humidity: string;
    winddirection: string;
    windpower: string;
    reporttime: string;
  }>;
}

export interface AmapWeatherForecastResponse extends AmapResponse {
  forecasts?: Array<{
    city: string;
    adcode: string;
    province: string;
    reporttime: string;
    casts: Array<{
      date: string;
      week: string;
      dayweather: string;
      nightweather: string;
      daytemp: string;
      nighttemp: string;
      daywind: string;
      nightwind: string;
      daypower: string;
      nightpower: string;
    }>;
  }>;
}

export interface AmapDirectionWalkingResponse extends AmapResponse {
  route?: {
    paths?: Array<{ distance: string; duration: string }>;
  };
}

export interface AmapDirectionTransitResponse extends AmapResponse {
  route?: {
    transits?: Array<{ duration: string; cost: string; distance: string }>;
  };
}

export interface AmapDirectionDrivingResponse extends AmapResponse {
  route?: {
    paths?: Array<{ distance: string; duration: string; tolls: string }>;
  };
}

export interface AmapGeoResponse extends AmapResponse {
  geocodes?: Array<{ adcode: string; location: string; formatted_address: string }>;
}

/** POI 文本搜索 */
export async function searchPOI(params: {
  keywords: string;
  city: string;
  types?: string;
  offset?: number;
}): Promise<AmapPoi[]> {
  const data = await amapGet<AmapPlaceTextResponse>("/place/text", {
    keywords: params.keywords,
    city: params.city,
    citylimit: "true",
    types: params.types ?? "",
    offset: String(params.offset ?? 20),
    page: "1",
    extensions: "all",
  });
  return data.pois ?? [];
}

/** 周边 POI 搜索 */
export async function searchAround(params: {
  location: string;
  keywords: string;
  types?: string;
  radius?: number;
}): Promise<AmapPoi[]> {
  const data = await amapGet<AmapPlaceAroundResponse>("/place/around", {
    location: params.location,
    keywords: params.keywords,
    types: params.types ?? "",
    radius: String(params.radius ?? 3000),
    offset: "15",
    page: "1",
    sortrule: "distance",
    extensions: "all",
  });
  return data.pois ?? [];
}

/** 获取城市 adcode */
export async function resolveCityAdcode(city: string): Promise<string> {
  const { CITY_ADCODES } = await import("../config");
  if (CITY_ADCODES[city]) return CITY_ADCODES[city];

  const data = await amapGet<AmapGeoResponse>("/geocode/geo", {
    address: city,
    city,
  });
  const adcode = data.geocodes?.[0]?.adcode;
  if (!adcode) throw new Error(`无法解析城市：${city}`);
  return adcode;
}

/** 实时天气 */
export async function fetchLiveWeather(adcode: string) {
  const data = await amapGet<AmapWeatherLiveResponse>("/weather/weatherInfo", {
    city: adcode,
    extensions: "base",
  });
  return data.lives?.[0];
}

/** 天气预报（未来几天） */
export async function fetchWeatherForecast(adcode: string) {
  const data = await amapGet<AmapWeatherForecastResponse>("/weather/weatherInfo", {
    city: adcode,
    extensions: "all",
  });
  return data.forecasts?.[0]?.casts ?? [];
}

/** 步行路线 */
export async function fetchWalkingRoute(origin: string, destination: string) {
  const data = await amapGet<AmapDirectionWalkingResponse>("/direction/walking", {
    origin,
    destination,
  });
  return data.route?.paths?.[0];
}

/** 公交路线 */
export async function fetchTransitRoute(origin: string, destination: string, city: string) {
  const data = await amapGet<AmapDirectionTransitResponse>("/direction/transit/integrated", {
    origin,
    destination,
    city,
    strategy: "0",
    nightflag: "0",
  });
  return data.route?.transits?.[0];
}

/** 驾车/打车路线 */
export async function fetchDrivingRoute(origin: string, destination: string) {
  const data = await amapGet<AmapDirectionDrivingResponse>("/direction/driving", {
    origin,
    destination,
    strategy: "0",
  });
  return data.route?.paths?.[0];
}

export function parseLocation(loc: string): { lng: number; lat: number } {
  const [lng, lat] = loc.split(",").map(Number);
  return { lng, lat };
}

export function toOrigin(poi: { lng: number; lat: number }): string {
  return `${poi.lng},${poi.lat}`;
}

export interface AmapPlaceDetailResponse {
  status: string;
  info: string;
  pois?: AmapPoi[];
}

export async function fetchPOIDetail(poiId: string) {
  const data = await amapGet<AmapPlaceDetailResponse>("/place/detail", {
    id: poiId,
    extensions: "all",
  });
  return data.pois?.[0];
}

export interface AmapInputTipsResponse extends AmapResponse {
  tips?: Array<{ name: string; district?: string; adcode?: string; address?: string }>;
}

/** 城市输入提示（高德 inputtips，勿用无效 datatype=city） */
export async function fetchCityInputTips(keywords: string): Promise<Array<{ name: string; district: string }>> {
  if (!keywords.trim() || keywords.length < 2) return [];
  const data = await amapGet<AmapInputTipsResponse>("/assistant/inputtips", {
    keywords: keywords.trim(),
  });
  return (data.tips ?? [])
    .filter((t) => t.name && t.adcode)
    .map((t) => ({
      name: t.name.replace(/市$/, "") === t.name ? t.name : t.name,
      district: [t.district, t.address].filter(Boolean).join(" · ") || t.name,
    }))
    .slice(0, 8);
}
