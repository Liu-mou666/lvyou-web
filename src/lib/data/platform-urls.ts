import { toCityLevelAdcode } from "../apis/city-resolver";

/** 携程酒店 cityId（地级市 adcode 前缀 → ctrip hotel cityId） */
const ADCODE_TO_CTRIP_HOTEL: Record<string, number> = {
  "1101": 1,
  "3101": 2,
  "3301": 17,
  "3201": 12,
  "3205": 14,
  "3202": 13,
  "4401": 32,
  "4403": 30,
  "5101": 28,
  "5001": 4,
  "6101": 10,
  "4201": 16,
  "4301": 148,
  "4308": 23,
  "5301": 34,
  "5307": 37,
  "3502": 15,
  "3702": 20,
  "2102": 19,
  "2101": 18,
  "1301": 24,
  "1401": 35,
  "4501": 175,
  "3303": 25,
  "3204": 11,
  "4404": 31,
  "4601": 42,
  "5201": 38,
  "3601": 22,
  "3401": 196,
};

/** you.ctrip.com 城市 slug（用于景点列表页） */
const CTRIP_SIGHT_SLUG: Record<number, string> = {
  1: "beijing",
  2: "shanghai",
  14: "suzhou",
  12: "nanjing",
  23: "zhangjiajie",
  148: "changsha",
  16: "wuhan",
  28: "chengdu",
  32: "guangzhou",
  30: "shenzhen",
};

export function getCtripCityId(adcode: string): number | null {
  const cityAdcode = toCityLevelAdcode(adcode);
  const prefix = cityAdcode.slice(0, 4);
  return ADCODE_TO_CTRIP_HOTEL[prefix] ?? null;
}

function enc(s: string) {
  return encodeURIComponent(s);
}

/** 清理店名/景点名，提升 OTA 搜索命中率 */
export function sanitizeCtripKeyword(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[（(][^）)]*[）)]/g, " ");
  s = s.replace(/[·•|｜/\\]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || raw.trim();
}

/** 酒店专用：保留品牌词，去掉分店括号后压缩 */
export function sanitizeHotelKeyword(raw: string, cityName?: string): string {
  const base = sanitizeCtripKeyword(raw);
  const city = cityName?.replace(/市$/g, "") ?? "";
  if (city && !base.includes(city) && /店$/.test(raw)) {
    return `${base} ${city}`.trim();
  }
  return base;
}

/** 景点：城市 + 核心名，避免只搜通用词 */
export function sanitizeSightKeyword(raw: string, cityName?: string): string {
  const core = sanitizeCtripKeyword(raw)
    .replace(/(景区|风景区|风景名胜区|公园|博物馆|纪念馆|古镇|步行街)$/g, "")
    .trim();
  const city = cityName?.replace(/市$/g, "") ?? "";
  if (city && core && !core.startsWith(city)) {
    return `${city} ${core}`.trim();
  }
  return core || sanitizeCtripKeyword(raw);
}

/** 携程 PC 火车票（直达+中转） */
export function ctripTrainSearchUrl(fromStation: string, toStation: string, date: string): string {
  return `https://trains.ctrip.com/webapp/train/list?ticketType=0&dStation=${enc(fromStation)}&aStation=${enc(toStation)}&dDate=${enc(date)}`;
}

/** 12306 官方查票 */
export function link12306Search(fromName: string, fromCode: string, toName: string, toCode: string, date: string): string {
  const fs = encodeURI(`${fromName},${fromCode}`);
  const ts = encodeURI(`${toName},${toCode}`);
  return `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=${fs}&ts=${ts}&date=${date}&flag=N,N,Y`;
}

/** 飞猪火车票 */
export function fliggyTrainSearchUrl(from: string, to: string, date: string): string {
  return `https://h5.m.taobao.com/trip/train/search.html?depCityName=${enc(from)}&arrCityName=${enc(to)}&depDate=${enc(date)}`;
}

/** 飞猪 POI/门票搜索（PC 可用） */
export function fliggyPoiSearchUrl(keyword: string): string {
  return `https://h5.m.taobao.com/trip/poi/search.html?keyword=${enc(sanitizeCtripKeyword(keyword))}`;
}

/** 携程门票 dest 路径（piao.ctrip.com/ticket/dest/t-城市-景点.html，PC 直达不跳 huodong 首页） */
function ctripTicketDestSlug(cityName: string, keyword: string): string {
  const city = cityName.replace(/市$/g, "");
  const kw = sanitizeSightKeyword(keyword, cityName);
  return `t-${city}-${kw}`;
}

/** 携程 PC 门票搜索 */
export function ctripTicketPcUrl(cityName: string, keyword: string, _cityId?: number | null): string {
  const slug = encodeURI(ctripTicketDestSlug(cityName, keyword));
  return `https://piao.ctrip.com/ticket/dest/${slug}.html`;
}

/** @deprecated huodong/list 已统一 302 到 web-home，请用 ctripTicketPcUrl */
export function ctripHuodongTicketUrl(cityName: string, keyword: string, cityId?: number | null): string {
  if (cityId) {
    const sight = ctripSightCityUrl(cityId);
    if (sight) return sight;
  }
  return ctripTicketPcUrl(cityName, keyword, cityId);
}

/** 携程门票深链：统一走 piao dest（勿用 huodong/list 或 mob 域名） */
export function ctripTicketSearchUrl(cityName: string, keyword: string, cityId?: number | null): string {
  return ctripTicketPcUrl(cityName, keyword, cityId);
}

/** 携程景点城市列表（PC 兜底，可手动搜） */
export function ctripSightCityUrl(cityId: number): string | null {
  const slug = CTRIP_SIGHT_SLUG[cityId];
  if (!slug) return null;
  return `https://you.ctrip.com/sight/${slug}${cityId}.html`;
}

/** 本地玩乐/妆造 */
export function ctripActivitySearchUrl(cityName: string, keyword: string, cityId?: number | null): string {
  const kw = sanitizeSightKeyword(`${keyword} 体验`, cityName);
  return ctripTicketPcUrl(cityName, kw, cityId);
}

/** 携程 PC 酒店 — directSearch + searchWord 才能精确到具体酒店 */
export function ctripHotelSearchUrl(
  cityName: string,
  keyword: string,
  checkIn: string,
  checkOut: string,
  cityId?: number | null,
): string {
  const kw = enc(sanitizeHotelKeyword(keyword, cityName));
  const city = enc(cityName.replace(/市$/g, ""));
  if (cityId) {
    return `https://hotels.ctrip.com/hotels/list?city=${cityId}&checkin=${checkIn}&checkout=${checkOut}&directSearch=1&searchWord=${kw}`;
  }
  return `https://hotels.ctrip.com/hotels/list?keyword=${kw}&checkin=${checkIn}&checkout=${checkOut}&directSearch=1&searchWord=${kw}`;
}

/** 大众点评 PC */
export function dianpingSearchUrl(cityId: number, keyword: string): string {
  return `https://www.dianping.com/search/keyword/${cityId}/0_${enc(sanitizeCtripKeyword(keyword))}`;
}

/**
 * 美团餐饮搜索（i.meituan.com 可解析；mob.meituan.com 在多数网络 DNS 不存在）
 * @param dianpingCityId 大众点评城市 ID，与美团同城体系一致，用于提升命中
 */
export function meituanSearchUrl(cityName: string, keyword: string, dianpingCityId?: number): string {
  const kw = sanitizeCtripKeyword(keyword);
  const city = cityName.replace(/市$/g, "");
  const q = new URLSearchParams({ keyword: kw, city });
  if (dianpingCityId) q.set("ci", String(dianpingCityId));
  return `https://i.meituan.com/poi/search?${q.toString()}`;
}

/** 高德 POI 详情 */
export function amapPlaceUrl(poiId: string): string {
  return `https://www.amap.com/place/${poiId}`;
}

export function amapNavUrl(name: string, lng: number, lat: number): string {
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${enc(name)}&coordinate=gaode&callnative=1`;
}

/** 携程酒店移动端 */
export function ctripHotelMobileUrl(
  cityName: string,
  keyword: string,
  checkIn: string,
  checkOut: string,
  cityId?: number | null,
): string {
  const kw = enc(sanitizeHotelKeyword(keyword, cityName));
  if (cityId) {
    return `https://m.ctrip.com/webapp/hotel/hotellist?city=${cityId}&keyword=${kw}&checkin=${checkIn}&checkout=${checkOut}&directSearch=1`;
  }
  return `https://m.ctrip.com/webapp/hotel/hotellist?keyword=${enc(cityName.replace(/市$/g, "") + " " + sanitizeHotelKeyword(keyword, cityName))}&checkin=${checkIn}&checkout=${checkOut}`;
}

/** 携程门票 H5（与 PC 共用 piao dest，避免 huodong 跳首页） */
export function ctripTicketMobileUrl(cityName: string, keyword: string, cityId?: number | null): string {
  return ctripTicketPcUrl(cityName, keyword, cityId);
}

/** 飞猪酒店搜索 */
export function fliggyHotelSearchUrl(city: string, keyword: string, checkIn: string): string {
  const q = sanitizeHotelKeyword(keyword, city);
  return `https://s.fliggy.com/hotel?q=${enc(`${city.replace(/市$/g, "")} ${q}`)}&checkIn=${checkIn}`;
}

/** @deprecated 旧 unified 搜索易跳首页，勿再使用 */
export function ctripUnifiedSearchUrl(keyword: string, _tab?: string): string {
  const kw = sanitizeCtripKeyword(keyword);
  return fliggyPoiSearchUrl(kw);
}
