import { toCityLevelAdcode } from "../apis/city-resolver";

/** 携程酒店/门票 cityId（地级市 adcode 前缀 → ctrip cityId） */
const ADCODE_TO_CTRIP: Record<string, number> = {
  "1101": 1, "3101": 2, "3301": 17, "3201": 12, "3205": 14, "3202": 13,
  "4401": 32, "4403": 30, "5101": 28, "5001": 4, "6101": 10, "4201": 16,
  "4301": 148, "4308": 23, "5301": 34, "5307": 37, "3502": 15, "3702": 20,
  "2102": 19, "2101": 18, "1301": 24, "1401": 35, "4501": 175,
};

export function getCtripCityId(adcode: string): number | null {
  const cityAdcode = toCityLevelAdcode(adcode);
  const prefix = cityAdcode.slice(0, 4);
  return ADCODE_TO_CTRIP[prefix] ?? null;
}

function enc(s: string) {
  return encodeURIComponent(s);
}

/** 携程 PC 火车票（直达+中转方案） */
export function ctripTrainSearchUrl(fromStation: string, toStation: string, date: string): string {
  return `https://trains.ctrip.com/webapp/train/list?ticketType=0&dStation=${enc(fromStation)}&aStation=${enc(toStation)}&dDate=${enc(date)}`;
}

/** 12306 官方查票（格式：站名,电报码 — 逗号不可编码） */
export function link12306Search(fromName: string, fromCode: string, toName: string, toCode: string, date: string): string {
  const fs = encodeURI(`${fromName},${fromCode}`);
  const ts = encodeURI(`${toName},${toCode}`);
  return `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=${fs}&ts=${ts}&date=${date}&flag=N,N,Y`;
}

/** 飞猪火车票 */
export function fliggyTrainSearchUrl(from: string, to: string, date: string): string {
  return `https://h5.m.taobao.com/trip/train/search.html?depCityName=${enc(from)}&arrCityName=${enc(to)}&depDate=${enc(date)}`;
}

/** 携程 PC 门票搜索（带城市名，避免跳首页） */
export function ctripTicketSearchUrl(cityName: string, keyword: string, cityId?: number | null): string {
  const q = enc(keyword);
  const city = enc(cityName.replace(/市$/g, ""));
  if (cityId) {
    return `https://you.ctrip.com/sightsearch/search?query=${q}&districtId=${cityId}&utcOffset=480`;
  }
  return `https://you.ctrip.com/sightsearch/search?query=${q}&cityName=${city}&utcOffset=480`;
}

/** 携程 PC 酒店搜索（带入住日期） */
export function ctripHotelSearchUrl(
  cityName: string,
  keyword: string,
  checkIn: string,
  checkOut: string,
  cityId?: number | null,
): string {
  const kw = enc(keyword);
  if (cityId) {
    return `https://hotels.ctrip.com/hotels/list?city=${cityId}&keyword=${kw}&checkin=${checkIn}&checkout=${checkOut}`;
  }
  return `https://hotels.ctrip.com/hotels/list?keyword=${kw}&checkin=${checkIn}&checkout=${checkOut}&cityName=${enc(cityName)}`;
}

/** 大众点评 PC 搜索（避免 m.dianping 404） */
export function dianpingSearchUrl(cityId: number, keyword: string): string {
  return `https://www.dianping.com/search/keyword/${cityId}/0_${enc(keyword)}`;
}

/** 高德 POI 详情（最可靠） */
export function amapPlaceUrl(poiId: string): string {
  return `https://www.amap.com/place/${poiId}`;
}

export function amapNavUrl(name: string, lng: number, lat: number): string {
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${enc(name)}&coordinate=gaode&callnative=1`;
}

/** 飞猪酒店搜索 */
export function fliggyHotelSearchUrl(city: string, keyword: string, checkIn: string): string {
  return `https://s.fliggy.com/hotel?q=${enc(city + " " + keyword)}&checkIn=${checkIn}`;
}
