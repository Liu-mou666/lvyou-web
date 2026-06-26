/**
 * POI 平台链接 + 价格增强（高德 → OTA 真爬 → 价库 → 深链）
 */
import { getDianpingCityId } from "./city-resolver";
import type { CityInfo } from "./city-resolver";
import type { POI, PlatformLink } from "../types";
import { enrichPriceFromSources } from "./price-enricher";
import { buildPriceCheckDeals } from "../engine/price-deals";
import {
  amapNavUrl,
  amapPlaceUrl,
  ctripActivitySearchUrl,
  ctripHotelMobileUrl,
  ctripHotelSearchUrl,
  ctripSightCityUrl,
  ctripTicketSearchUrl,
  dianpingSearchUrl,
  fliggyHotelSearchUrl,
  fliggyPoiSearchUrl,
  getCtripCityId,
  meituanSearchUrl,
  sanitizeHotelKeyword,
  sanitizeSightKeyword,
} from "../data/platform-urls";
import { resolveCtripCityIdBest } from "../scrapers/ctrip-city-index";

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
  opts?: { checkIn?: string; ctripCityId?: number | null },
): PlatformLink[] {
  const shopName = poi.name.trim();
  const city = cityInfo.name.replace(/市$/g, "");
  const ctripCityId = opts?.ctripCityId ?? getCtripCityId(cityInfo.adcode);
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
      const sightKw = sanitizeSightKeyword(shopName, city);
      links.push(
        {
          platform: "ctrip",
          label: "携程",
          action: "查门票",
          url: ctripTicketSearchUrl(city, shopName, ctripCityId),
        },
        {
          platform: "fliggy",
          label: "飞猪",
          action: "搜门票",
          url: fliggyPoiSearchUrl(sightKw),
        },
        {
          platform: "dianping",
          label: "大众点评",
          action: "查看景点",
          url: dianpingSearchUrl(dpCityId, shopName),
        },
      );
      if (ctripCityId) {
        const cityList = ctripSightCityUrl(ctripCityId);
        if (cityList) {
          links.push({
            platform: "ctrip",
            label: "携程玩乐",
            action: `${city}景点列表`,
            url: cityList,
          });
        }
      }
    }
  }

  if (poi.type === "hotel") {
    const hotelKw = sanitizeHotelKeyword(shopName, city);
    links.push(
      {
        platform: "ctrip",
        label: "携程",
        action: `查${checkIn}房价`,
        url: ctripHotelSearchUrl(city, shopName, checkIn, checkOut, ctripCityId),
      },
      {
        platform: "ctrip",
        label: "携程手机",
        action: `手机查${checkIn}价`,
        url: ctripHotelMobileUrl(city, shopName, checkIn, checkOut, ctripCityId),
      },
      {
        platform: "fliggy",
        label: "飞猪",
        action: `查${checkIn}房价`,
        url: fliggyHotelSearchUrl(city, shopName, checkIn),
      },
      {
        platform: "dianping",
        label: "大众点评",
        action: "查看酒店",
        url: dianpingSearchUrl(dpCityId, shopName),
      },
    );
  }

  return links;
}

export function buildVerifiedDeals(poi: POI, links: PlatformLink[]) {
  return buildPriceCheckDeals(poi, links);
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
  opts?: { checkIn?: string; travelers?: number },
): Promise<POI> {
  const travelers = opts?.travelers ?? 2;
  const ctripCityId =
    (await resolveCtripCityIdBest(cityInfo.name)) ?? getCtripCityId(cityInfo.adcode);
  let enriched = await enrichPriceFromSources(poi, travelers, cityInfo.name, {
    checkIn: opts?.checkIn,
    adcode: cityInfo.adcode,
    cityName: cityInfo.name,
  });
  const links = buildPOILinks(enriched, cityInfo, { ...opts, ctripCityId });
  const deals = buildVerifiedDeals(enriched, links);
  const checkIn = opts?.checkIn;

  let priceNote = enriched.priceNote;
  if (!priceNote) {
    if (enriched.type === "hotel") {
      priceNote = checkIn
        ? `点「携程查当晚房价」搜 ${checkIn} 实价`
        : "房价以携程/飞猪当日为准";
    } else if (enriched.type === "restaurant" || enriched.type === "cafe") {
      priceNote =
        enriched.pricePerPerson > 0
          ? `高德人均约 ¥${enriched.pricePerPerson}，点评/美团看菜单`
          : "点下方一键查菜单价";
    } else if (enriched.type === "attraction") {
      if (enriched.pricePerPerson === 0 && enriched.freeAttraction) {
        priceNote = "免费开放（高德未收录门票）";
      } else if (enriched.pricePerPerson > 0) {
        priceNote = `高德门票 ¥${enriched.pricePerPerson}/人，携程可查当日票`;
      } else {
        priceNote = "点「携程查门票」看当日售价";
      }
    }
  }

  return {
    ...enriched,
    links,
    deals,
    valueScore: calcValueScore(enriched),
    priceNote,
    priceConfidence:
      enriched.priceConfidence ?? (enriched.pricePerPerson > 0 ? "high" : deals.length > 0 ? "medium" : "none"),
  };
}
