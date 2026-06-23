/**
 * POI 平台链接：高德详情为主（100%可用），携程/点评为 PC 搜索页
 */
import { getDianpingCityId } from "./city-resolver";
import type { CityInfo } from "./city-resolver";
import type { POI, PlatformLink, DealInfo } from "../types";
import {
  amapNavUrl,
  amapPlaceUrl,
  ctripHotelSearchUrl,
  ctripTicketSearchUrl,
  dianpingSearchUrl,
  fliggyHotelSearchUrl,
  getCtripCityId,
} from "../data/platform-urls";
import { ctripTrainUrl } from "../data/station-db";

function cleanName(name: string) {
  return name.replace(/[（(【\[].*?[）)\]】]/g, "").trim();
}

function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function buildPOILinks(
  poi: POI,
  cityInfo: CityInfo,
  opts?: { checkIn?: string },
): PlatformLink[] {
  const name = cleanName(poi.name);
  const city = cityInfo.name.replace(/市$/g, "");
  const ctripCityId = getCtripCityId(cityInfo.adcode);
  const dpCityId = getDianpingCityId(cityInfo.adcode);
  const checkIn = opts?.checkIn ?? new Date().toISOString().split("T")[0];
  const checkOut = nextDay(checkIn);

  const links: PlatformLink[] = [
    { platform: "amap", label: "高德地图", action: "导航", url: amapNavUrl(name, poi.lng, poi.lat) },
    { platform: "amap", label: "高德", action: "详情·电话·营业时间", url: amapPlaceUrl(poi.id) },
  ];

  if (poi.tel) {
    const phone = String(poi.tel).replace(/\s/g, "");
    links.push({ platform: "amap", label: "电话", action: phone, url: `tel:${phone}` });
  }

  if (poi.type === "restaurant" || poi.type === "cafe") {
    links.push({
      platform: "dianping",
      label: "大众点评",
      action: "搜店铺",
      url: dianpingSearchUrl(dpCityId, name),
    });
  }

  if (poi.type === "attraction") {
    links.push(
      {
        platform: "ctrip",
        label: "携程",
        action: "搜门票",
        url: ctripTicketSearchUrl(city, name, ctripCityId),
      },
      {
        platform: "dianping",
        label: "大众点评",
        action: "搜景点",
        url: dianpingSearchUrl(dpCityId, name),
      },
    );
  }

  if (poi.type === "hotel") {
    links.push(
      {
        platform: "ctrip",
        label: "携程",
        action: "查房价",
        url: ctripHotelSearchUrl(city, name, checkIn, checkOut, ctripCityId),
      },
      {
        platform: "dianping",
        label: "大众点评",
        action: "查酒店",
        url: dianpingSearchUrl(dpCityId, name + " 酒店"),
      },
      {
        platform: "fliggy",
        label: "飞猪",
        action: "查房价",
        url: fliggyHotelSearchUrl(city, name, checkIn),
      },
    );
  }

  return links;
}

export function buildVerifiedDeals(poi: POI, links: PlatformLink[]): DealInfo[] {
  const base = poi.pricePerPerson || (poi.cost > 0 ? poi.cost / 2 : 0);
  if (base <= 0) return [];

  const amap = links.find((l) => l.platform === "amap" && l.action.includes("详情"));
  const ctrip = links.find((l) => l.platform === "ctrip");

  if (poi.type === "attraction") {
    return [{
      platform: "高德参考",
      dealPrice: Math.round(base * 2),
      label: "门票参考（2人）",
      url: amap?.url ?? ctrip?.url ?? amapPlaceUrl(poi.id),
      discount: "以高德/平台实时为准",
    }];
  }
  if (poi.type === "hotel" && ctrip) {
    return [{
      platform: "携程",
      dealPrice: Math.round(base),
      label: "每晚参考",
      url: ctrip.url,
      discount: "参考价·需登录查实时",
    }];
  }
  return [];
}

export function calcValueScore(poi: POI): number {
  const price = Math.max(poi.pricePerPerson, poi.cost / 2, 1);
  const rating = poi.compositeRating ?? poi.rating;
  return Math.round(rating * 18 + Math.max(0, 100 - price * 0.6) * 0.4);
}

export async function enrichPOIVerified(
  poi: POI,
  cityInfo: CityInfo,
  opts?: { checkIn?: string },
): Promise<POI> {
  const links = buildPOILinks(poi, cityInfo, opts);
  const deals = buildVerifiedDeals(poi, links);
  return {
    ...poi,
    links,
    deals,
    valueScore: calcValueScore(poi),
    priceNote: poi.pricePerPerson > 0 ? "参考价·点击高德详情或携程查看实时" : undefined,
  };
}

export { ctripTrainUrl };
