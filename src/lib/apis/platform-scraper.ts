/**
 * POI 平台链接：高德详情最可靠；第三方用店名精准搜，避免拼地址导致零结果
 */
import { getDianpingCityId } from "./city-resolver";
import type { CityInfo } from "./city-resolver";
import type { POI, PlatformLink, DealInfo } from "../types";
import {
  amapNavUrl,
  amapPlaceUrl,
  ctripActivitySearchUrl,
  ctripHotelSearchUrl,
  ctripTicketSearchUrl,
  ctripUnifiedSearchUrl,
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
  const shopName = poi.name.trim();
  const city = cityInfo.name.replace(/市$/g, "");
  const ctripCityId = getCtripCityId(cityInfo.adcode);
  const dpCityId = getDianpingCityId(cityInfo.adcode);
  const checkIn = opts?.checkIn ?? new Date().toISOString().split("T")[0];
  const checkOut = nextDay(checkIn);

  const links: PlatformLink[] = [
    { platform: "amap", label: "高德地图", action: "导航", url: amapNavUrl(shopName, poi.lng, poi.lat) },
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
        url: dianpingSearchUrl(dpCityId, shopName),
      },
      {
        platform: "meituan",
        label: "美团",
        action: "查看店铺",
        url: meituanSearchUrl(city, shopName),
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
          url: dianpingSearchUrl(dpCityId, shopName),
        },
        {
          platform: "ctrip",
          label: "携程",
          action: "搜体验",
          url: ctripActivitySearchUrl(city, shopName, ctripCityId),
        },
      );
    } else {
      links.push(
        {
          platform: "ctrip",
          label: "携程",
          action: "搜门票",
          url: ctripTicketSearchUrl(city, shopName, ctripCityId),
        },
        {
          platform: "dianping",
          label: "大众点评",
          action: "查看景点",
          url: dianpingSearchUrl(dpCityId, shopName),
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
        url: ctripHotelSearchUrl(city, shopName, checkIn, checkOut, ctripCityId),
      },
      {
        platform: "ctrip",
        label: "携程",
        action: "站内搜酒店",
        url: ctripUnifiedSearchUrl(`${city} ${shopName}`, "hotel"),
      },
      {
        platform: "dianping",
        label: "大众点评",
        action: "查看酒店",
        url: dianpingSearchUrl(dpCityId, shopName),
      },
      {
        platform: "fliggy",
        label: "飞猪",
        action: `查${checkIn}房价`,
        url: fliggyHotelSearchUrl(city, shopName, checkIn),
      },
    );
  }

  return links;
}

export function buildVerifiedDeals(_poi: POI, _links: PlatformLink[]): DealInfo[] {
  return [];
}

export function calcValueScore(poi: POI): number {
  const price = poi.pricePerPerson > 0 ? poi.pricePerPerson : 1;
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
      ? `点击携程链接搜「${poi.name}」查看 ${checkIn} 当日房价`
      : "房价以携程/飞猪当日实价为准";
  } else if (poi.type === "restaurant" || poi.type === "cafe") {
    priceNote =
      poi.pricePerPerson > 0
        ? `高德人均约 ¥${poi.pricePerPerson}，以点评/美团菜单为准`
        : "价格以点评/美团当日为准";
  } else if (poi.type === "attraction") {
    if (poi.pricePerPerson === 0) {
      priceNote = poi.freeAttraction ? "免费开放（高德未收录门票）" : "高德未收录票价，以窗口/携程为准";
    } else {
      priceNote = `高德门票参考 ¥${poi.pricePerPerson}/人，以携程/窗口当日为准`;
    }
  }

  return {
    ...poi,
    links,
    deals,
    valueScore: calcValueScore(poi),
    priceNote,
  };
}
