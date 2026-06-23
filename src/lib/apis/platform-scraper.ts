/**
 * POI 平台链接：高德详情为主；携程/点评用「店名+地址」精准搜索
 */
import { getDianpingCityId } from "./city-resolver";
import type { CityInfo } from "./city-resolver";
import type { POI, PlatformLink, DealInfo } from "../types";
import {
  addressSearchHint,
  amapNavUrl,
  amapPlaceUrl,
  ctripActivitySearchUrl,
  ctripHotelSearchUrl,
  ctripTicketSearchUrl,
  dianpingSearchUrl,
  fliggyHotelSearchUrl,
  getCtripCityId,
  meituanSearchUrl,
} from "../data/platform-urls";

function nextDay(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function isExperienceShop(poi: POI): boolean {
  return /汉服|旅拍|妆造|写真|跟拍|摄影/.test(`${poi.name}${poi.description}`);
}

export function buildPOILinks(
  poi: POI,
  cityInfo: CityInfo,
  opts?: { checkIn?: string },
): PlatformLink[] {
  const fullName = poi.name.trim();
  const city = cityInfo.name.replace(/市$/g, "");
  const ctripCityId = getCtripCityId(cityInfo.adcode);
  const dpCityId = getDianpingCityId(cityInfo.adcode);
  const addrHint = addressSearchHint(poi.address);
  const checkIn = opts?.checkIn ?? new Date().toISOString().split("T")[0];
  const checkOut = nextDay(checkIn);

  const links: PlatformLink[] = [
    { platform: "amap", label: "高德地图", action: "导航", url: amapNavUrl(fullName, poi.lng, poi.lat) },
    { platform: "amap", label: "高德", action: "详情·电话·营业时间", url: amapPlaceUrl(poi.id) },
  ];

  if (poi.tel) {
    const phone = String(poi.tel).replace(/\s/g, "");
    links.push({ platform: "amap", label: "电话", action: phone, url: `tel:${phone}` });
  }

  if (poi.type === "restaurant" || poi.type === "cafe") {
    links.push(
      {
        platform: "dianping",
        label: "大众点评",
        action: "查看店铺",
        url: dianpingSearchUrl(dpCityId, fullName, addrHint),
      },
      {
        platform: "meituan",
        label: "美团",
        action: "查看店铺",
        url: meituanSearchUrl(city, fullName, addrHint),
      },
    );
  }

  if (poi.type === "attraction") {
    if (isExperienceShop(poi)) {
      links.push(
        {
          platform: "dianping",
          label: "大众点评",
          action: "查看店铺",
          url: dianpingSearchUrl(dpCityId, fullName, addrHint),
        },
        {
          platform: "ctrip",
          label: "携程",
          action: "搜体验",
          url: ctripActivitySearchUrl(city, fullName, ctripCityId),
        },
      );
    } else {
      links.push(
        {
          platform: "ctrip",
          label: "携程",
          action: "搜门票",
          url: ctripTicketSearchUrl(city, fullName, ctripCityId),
        },
        {
          platform: "dianping",
          label: "大众点评",
          action: "查看店铺",
          url: dianpingSearchUrl(dpCityId, fullName, addrHint),
        },
      );
    }
  }

  if (poi.type === "hotel") {
    links.push(
      {
        platform: "ctrip",
        label: "携程",
        action: `查${checkIn}房价`,
        url: ctripHotelSearchUrl(city, fullName, checkIn, checkOut, ctripCityId),
      },
      {
        platform: "dianping",
        label: "大众点评",
        action: "查看酒店",
        url: dianpingSearchUrl(dpCityId, fullName, addrHint),
      },
      {
        platform: "fliggy",
        label: "飞猪",
        action: `查${checkIn}房价`,
        url: fliggyHotelSearchUrl(city, fullName, checkIn),
      },
    );
  }

  return links;
}

/** 不再展示估算「团购价」，仅引导至平台查实时价 */
export function buildVerifiedDeals(_poi: POI, _links: PlatformLink[]): DealInfo[] {
  return [];
}

export function calcValueScore(poi: POI): number {
  const price = Math.max(poi.pricePerPerson, poi.cost / 2, 1);
  const rating = poi.compositeRating ?? poi.rating;
  const reviewBonus = poi.reviewCount >= 5000 ? 8 : poi.reviewCount >= 1000 ? 4 : 0;
  return Math.round(rating * 18 + Math.max(0, 100 - price * 0.6) * 0.4 + reviewBonus);
}

export async function enrichPOIVerified(
  poi: POI,
  cityInfo: CityInfo,
  opts?: { checkIn?: string },
): Promise<POI> {
  const links = buildPOILinks(poi, cityInfo, opts);
  const deals = buildVerifiedDeals(poi, links);
  const checkIn = opts?.checkIn;

  let priceNote: string | undefined;
  if (poi.type === "hotel") {
    priceNote = checkIn
      ? `房价需登录携程/飞猪查看 ${checkIn} 当日实价，高德标价仅供参考`
      : "房价以携程/飞猪当日实价为准";
  } else if (poi.type === "restaurant" || poi.type === "cafe") {
    priceNote =
      poi.pricePerPerson > 0
        ? `人均 ¥${poi.pricePerPerson} 来自高德，以点评/美团当日菜单为准`
        : "价格以点评/美团当日为准";
  } else if (poi.type === "attraction" && poi.pricePerPerson > 0) {
    priceNote = `门票 ¥${poi.pricePerPerson}/人来自高德，以携程/窗口当日票价为准`;
  }

  return {
    ...poi,
    links,
    deals,
    valueScore: calcValueScore(poi),
    priceNote,
  };
}
