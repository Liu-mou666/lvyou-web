import {
  fetchWeatherForecast,
  parseLocation,
  searchAround,
  searchPOI,
  type AmapPoi,
} from "./amap";
import { resolveCityInfo, type CityInfo } from "./city-resolver";
import { enrichPOIVerified, buildPOILinks } from "./platform-scraper";
import { isServerlessFastPath } from "../config";
import { authorityBonus, matchAuthorityTag } from "../data/authority-lists";
import { matchesDietary } from "../engine/constraint-parser";
import type { BudgetLevel, MealPref, MealTime, POI, POIType, RankedAttraction, TravelStyle, WeatherForecast } from "../types";
import { rankAttractions, type AttractionRankContext } from "../engine/poi-ranker";
import scenicList from "@/data/scenic-5a.json";
import { fetchPOIDetail } from "./amap";
import pLimit from "p-limit";
import { cacheKey, CACHE_TTL } from "../cache/memory";
import { storeGetSync, storeSetSync } from "../cache/store";

const STYLE_KEYWORDS: Record<TravelStyle, string[]> = {
  culture: ["5A景区", "博物馆", "名胜古迹"],
  food: ["特色餐厅", "老字号", "网红美食"],
  nature: ["风景名胜", "国家公园", "湿地"],
  shopping: ["步行街", "古镇", "商业区"],
  mixed: ["必去景点", "热门景点", "5A景区", "网红打卡"],
};

const CITY_CUISINE: Record<string, string[]> = {
  苏州: ["苏帮菜", "本帮菜", "太湖三白", "松鼠桂鱼"],
  杭州: ["杭帮菜", "西湖醋鱼", "东坡肉", "龙井虾仁"],
  南京: ["金陵菜", "盐水鸭", "鸭血粉丝"],
  成都: ["川菜", "火锅", "串串"],
  重庆: ["重庆火锅", "江湖菜", "小面"],
  广州: ["粤菜", "早茶", "烧腊"],
  北京: ["北京菜", "烤鸭", "涮羊肉"],
  上海: ["本帮菜", "生煎", "小笼包"],
  西安: ["陕菜", "肉夹馍", "羊肉泡馍"],
  长沙: ["湘菜", "口味虾", "臭豆腐"],
  武汉: ["湖北菜", "热干面", "武昌鱼"],
  厦门: ["闽南菜", "海鲜", "沙茶面"],
  张家界: ["土家族菜", "三下锅", "腊肉"],
  丽江: ["纳西菜", "腊排骨", "鸡豆凉粉"],
};

const CHAIN_NAMES = /麦当劳|肯德基|KFC|必胜客|星巴克|华莱士|德克士|汉堡王|赛百味|真功夫|吉野家|永和大王|老乡鸡|乡村基|食其家|达美乐|棒约翰|Subway|McDonald|汉堡|披萨/;
const JUNK_NAME = /混沌|馄饨|沙县|兰州拉面|麻辣烫|黄焖鸡|千里香|螺蛳粉|便利店|超市|食堂|手抓饼|煎饼|麦当劳|肯德基/;
const JUNK_MAIN_MEAL = /早餐|豆浆|油条|粥铺|简餐|快餐|小吃店|面馆|粉店|饼屋/;

const MAX_HOTEL_NIGHT: Record<BudgetLevel, number> = {
  budget: 180,
  moderate: 350,
  luxury: 600,
};

/** 情侣出行最低可接受房价/晚（低于此多为青旅床位，不推荐） */
const MIN_HOTEL_NIGHT: Record<BudgetLevel, number> = {
  budget: 100,
  moderate: 120,
  luxury: 280,
};

const MAX_ATTRACTION: Record<BudgetLevel, number> = {
  budget: 40,
  moderate: 80,
  luxury: 150,
};

const MAX_MEAL_PER_PERSON: Record<BudgetLevel, number> = {
  budget: 80,
  moderate: 150,
  luxury: 999,
};

function mapWeatherCondition(text: string): WeatherForecast["condition"] {
  if (text.includes("雪")) return "snowy";
  if (text.includes("雨")) return "rainy";
  if (text.includes("晴")) return "sunny";
  return "cloudy";
}

function parseOpenHours(openTime?: string | unknown): { open: string; close: string } {
  if (!openTime || typeof openTime !== "string") return { open: "09:00", close: "21:00" };
  const parts = openTime.split("-");
  if (parts.length === 2) {
    return { open: parts[0].trim().slice(0, 5), close: parts[1].trim().slice(0, 5) };
  }
  return { open: "09:00", close: "21:00" };
}

function estimateDuration(type: POIType, poiType: string, name: string): number {
  if (type === "restaurant") return 75;
  if (type === "hotel") return 0;
  if (poiType.includes("博物馆") || name.includes("博物")) return 150;
  if (poiType.includes("风景") || poiType.includes("公园")) return 120;
  if (name.includes("妆造") || name.includes("汉服") || name.includes("写真")) return 120;
  return 120;
}

function isIndoor(type: string, name: string): boolean {
  return ["博物馆", "展览", "商场", "剧院", "美术馆", "科技馆", "室内", "妆造", "汉服", "写真"].some(
    (k) => type.includes(k) || name.includes(k),
  );
}

function defaultPrice(type: POIType, mealTime?: MealTime, budget?: BudgetLevel): number {
  if (type === "restaurant") {
    const cap = MAX_MEAL_PER_PERSON[budget ?? "moderate"];
    const base = mealTime === "breakfast" ? 25 : mealTime === "lunch" ? 60 : mealTime === "dinner" ? 70 : 50;
    return Math.min(base, cap);
  }
  if (type === "attraction") return MAX_ATTRACTION[budget ?? "moderate"];
  if (type === "hotel") return MAX_HOTEL_NIGHT[budget ?? "moderate"];
  return 50;
}

function isChainRestaurant(name: string): boolean {
  return CHAIN_NAMES.test(name);
}

function isQualityRestaurant(
  poi: POI,
  mealTime: MealTime,
  mealPref?: MealPref,
  budget?: BudgetLevel,
  dietary?: string[],
): boolean {
  const maxPrice = MAX_MEAL_PER_PERSON[budget ?? "moderate"];
  if (poi.rating < 4.3) return false;
  if (isChainRestaurant(poi.name)) return false;
  if (poi.pricePerPerson > maxPrice) return false;
  if (dietary?.length && !matchesDietary(poi, dietary)) return false;

  const text = `${poi.name}${poi.signature ?? ""}${poi.description}`;
  if (JUNK_NAME.test(poi.name)) return false;
  if (mealTime !== "breakfast" && JUNK_MAIN_MEAL.test(text)) return false;
  if (mealPref === "local" && (isChainRestaurant(poi.name) || /连锁|快餐|全国|西式/.test(text))) return false;
  return true;
}

function getMealKeywords(
  cityName: string,
  mealTime: MealTime,
  mealPref?: MealPref,
  budget?: BudgetLevel,
  dietary?: string[],
): string[] {
  const city = cityName.replace(/市|区|县$/, "");
  const local = CITY_CUISINE[city] ?? CITY_CUISINE[cityName] ?? [];
  const base =
    mealTime === "breakfast"
      ? ["早茶", "特色早餐", "老字号"]
      : mealTime === "lunch"
        ? ["特色餐厅", "本地菜", "人气餐厅"]
        : ["特色餐厅", "本地菜", "老字号"];

  const dietaryKw: string[] = [];
  if (dietary?.includes("清真")) dietaryKw.push("清真", "西北菜");
  if (dietary?.includes("素食")) dietaryKw.push("素食", "素菜馆", "轻食");
  if (dietary?.includes("不辣")) dietaryKw.push("本帮菜", "粤菜", "苏帮菜");

  if (budget === "budget") return [...dietaryKw, ...local.slice(0, 2), "家常菜", "小吃"];
  if (mealPref === "local" && local.length > 0) return [...dietaryKw, ...local, ...base.slice(0, 1)];
  if (mealPref === "fast") return [...dietaryKw, "快餐", "简餐"];
  return [...dietaryKw, ...base, ...local.slice(0, 1)];
}

function isLikelyFreeAttraction(name: string, poiType: string): boolean {
  if (/步行街|老街|古镇|历史街区|滨江|运河|山塘|平江路|步行街|广场|公园$|绿道|湿地(?!公园收费)/.test(name)) {
    return !/景区|风景区|门票|索道|游船/.test(name);
  }
  if (/博物馆|纪念馆/.test(name) && !/收费/.test(name)) return true;
  return false;
}

function amapToPOI(
  raw: AmapPoi,
  type: POIType,
  category: TravelStyle,
  cityName: string,
  mealTime?: MealTime,
  budget?: BudgetLevel,
  travelers = 2,
): POI | null {
  if (!raw.location || !raw.name) return null;
  const { lat, lng } = parseLocation(raw.location);
  const rating = parseFloat(raw.biz_ext?.rating ?? "0") || 0;
  if (rating > 0 && rating < 4.0) return null;

  const costRaw = parseFloat(raw.biz_ext?.cost ?? "0") || 0;
  const { open, close } = parseOpenHours(raw.biz_ext?.open_time);

  let pricePerPerson = 0;
  if (costRaw > 0) {
    pricePerPerson = costRaw;
  } else if (type === "attraction") {
    pricePerPerson = 0;
  } else if (type === "hotel") {
    pricePerPerson = 0;
  } else {
    pricePerPerson = defaultPrice(type, mealTime, budget);
  }

  const likelyFree = type === "attraction" && pricePerPerson === 0 && isLikelyFreeAttraction(raw.name, raw.type);

  if (type === "hotel") {
    const maxNight = MAX_HOTEL_NIGHT[budget ?? "moderate"];
    if (pricePerPerson > maxNight * 1.5) pricePerPerson = maxNight;
  }
  if (type === "restaurant") {
    const maxMeal = MAX_MEAL_PER_PERSON[budget ?? "moderate"];
    if (pricePerPerson > maxMeal) return null;
  }
  if (type === "attraction") {
    const maxTicket = MAX_ATTRACTION[budget ?? "moderate"];
    if (pricePerPerson > maxTicket * 1.5) return null;
    // 不再把票价强行压到 80 展示
  }

  const authority = matchAuthorityTag(raw.name, cityName);
  const authorityBoost = authority ? authorityBonus(raw.name, cityName) : 0;
  const compositeRating = Math.min(5, rating + (authority ? 0.15 : 0));
  const photoUrls = (raw.photos ?? []).map((p) => p.url).filter(Boolean).slice(0, 4);

  let priceConfidence: POI["priceConfidence"] = "none";
  if (costRaw > 0) priceConfidence = "high";
  else if (type === "attraction" && likelyFree) priceConfidence = "medium";
  else if (type !== "attraction") priceConfidence = "low";

  return {
    id: raw.id,
    name: raw.name.trim(),
    type,
    category,
    lat,
    lng,
    durationMinutes: estimateDuration(type, raw.type, raw.name),
    cost: type === "hotel" ? Math.round(pricePerPerson) : pricePerPerson > 0 ? Math.round(pricePerPerson * travelers) : 0,
    pricePerPerson,
    freeAttraction: likelyFree,
    rating: Math.min(5, rating || 4.0),
    compositeRating: Math.round(compositeRating * 10) / 10,
    reviewCount: Math.round((rating || 4) * 10000),
    reviewCountEstimated: true,
    priceConfidence,
    openTime: open,
    closeTime: close,
    indoor: isIndoor(raw.type, raw.name),
    description: raw.address || raw.type.split(";")[0] || "",
    tips: raw.tel ? `电话 ${String(raw.tel)}` : "",
    mealTime,
    signature: type === "restaurant" ? raw.type.split(";")[0] : undefined,
    address: raw.address,
    source: "高德地图",
    photoUrl: photoUrls[0],
    photoUrls,
    tel: raw.tel ? String(raw.tel) : undefined,
    authorityTag: authority?.tag,
    valueScore: Math.round((rating || 4) * 18 + authorityBoost),
  };
}

function dedupePOIs(pois: POI[]): POI[] {
  const seen = new Set<string>();
  return pois.filter((p) => {
    const key = p.name.slice(0, 8);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mealValueScore(poi: POI): number {
  const price = Math.max(poi.pricePerPerson, 1);
  return poi.rating * 20 - price * 0.3;
}

function hotelValueScore(poi: POI, priority: import("../types").PriorityMode = "value"): number {
  const price = Math.max(poi.pricePerPerson, 1);
  if (priority === "value") return poi.rating * 12 - price * 0.4;
  if (priority === "experience") return poi.rating * 28 - price * 0.06;
  return poi.rating * 20 - price * 0.12;
}

/** 当日最后一站附近酒店，按性价比/预算排序 */
export async function fetchHotelsNearLocation(
  nearLocation: string,
  cityInfo: CityInfo,
  budget: BudgetLevel,
  limit = 3,
  checkIn?: string,
  opts?: {
    priority?: import("../types").PriorityMode;
    totalBudget?: number;
    days?: number;
    travelers?: number;
    maxHotelPerNight?: number;
  },
): Promise<POI[]> {
  const priority = opts?.priority ?? "value";
  const travelers = opts?.travelers ?? 2;
  const days = opts?.days ?? 1;
  const totalBudget = opts?.totalBudget ?? 0;

  let maxNight = MAX_HOTEL_NIGHT[budget];
  let minNight = MIN_HOTEL_NIGHT[budget];

  if (opts?.maxHotelPerNight && opts.maxHotelPerNight > 0) {
    maxNight = Math.min(maxNight, opts.maxHotelPerNight);
    minNight = Math.min(minNight, Math.round(opts.maxHotelPerNight * 0.75));
  }

  if (totalBudget > 0 && days > 0) {
    const perPersonDay = totalBudget / days / Math.max(travelers, 1);
    const lodgingShare = priority === "value" ? 0.32 : priority === "time" ? 0.42 : 0.38;
    const capFromBudget = Math.round(perPersonDay * lodgingShare);
    maxNight = Math.min(maxNight, Math.max(minNight, capFromBudget));
  } else if (priority === "value" || budget === "budget") {
    maxNight = Math.min(maxNight, budget === "budget" ? 150 : 180);
  }

  const keywords =
    priority === "value" || budget === "budget"
      ? ["汉庭", "如家", "7天", "锦江之星", "格林豪泰", "全季", "维也纳", "经济型酒店"]
      : budget === "luxury"
        ? ["高档酒店", "精品酒店", "四星酒店"]
        : ["全季", "亚朵", "汉庭", "舒适型酒店", "商务酒店"];

  const all: POI[] = [];
  const refNight =
    budget === "luxury" ? 380 : budget === "budget" ? 150 : priority === "value" ? 180 : 260;

  function acceptHotel(mapped: POI): POI | null {
    let price = mapped.pricePerPerson;
    if (price <= 0) {
      if (/汉庭|如家|7天|锦江之星|格林豪泰|尚客优|怡莱/.test(mapped.name)) {
        price = 128;
        mapped.priceNote = "连锁经济型参考价 ¥128/晚";
      } else if (/全季|亚朵|维也纳/.test(mapped.name)) {
        price = 168;
        mapped.priceNote = "连锁舒适型参考价 ¥168/晚";
      } else {
        price = refNight;
        mapped.priceNote = `区域酒店参考价 ¥${refNight}/晚 · 请平台核实`;
      }
      mapped.pricePerPerson = price;
      mapped.cost = price;
      mapped.priceConfidence = "low";
    }
    if (price < minNight * 0.7 || price > maxNight * 1.15) return null;
    if (mapped.rating < 3.5 && mapped.rating > 0) return null;
    return mapped;
  }

  for (const kw of keywords) {
    const pois = await searchAround({ location: nearLocation, keywords: kw, types: "100000", radius: 3000 });
    for (const p of pois) {
      const mapped = amapToPOI(p, "hotel", "mixed", cityInfo.name, undefined, budget);
      if (!mapped) continue;
      const accepted = acceptHotel(mapped);
      if (accepted) all.push(accepted);
    }
  }

  if (all.length < limit) {
    const fallback = await searchAround({ location: nearLocation, keywords: "酒店", types: "100000", radius: 4000 });
    for (const p of fallback) {
      const mapped = amapToPOI(p, "hotel", "mixed", cityInfo.name, undefined, budget);
      if (!mapped) continue;
      const accepted = acceptHotel(mapped);
      if (accepted) all.push(accepted);
    }
  }

  const deduped = dedupePOIs(all);

  const ranked = deduped.sort((a, b) => {
    if (priority === "value") {
      const priceDiff = a.pricePerPerson - b.pricePerPerson;
      if (priceDiff !== 0) return priceDiff;
      return b.rating - a.rating;
    }
    return hotelValueScore(b, priority) - hotelValueScore(a, priority);
  });

  const picked = ranked.slice(0, limit + 2);

  if (isServerlessFastPath()) {
    return picked.slice(0, limit).map((p) => ({
      ...p,
      links: buildPOILinks(p, cityInfo, { checkIn }),
      priceNote: p.priceNote ?? `参考 ¥${p.pricePerPerson}/晚 · 点携程查当晚实价`,
    }));
  }

  const verified: POI[] = [];
  for (const p of picked.slice(0, limit)) {
    const enriched = await enrichPOIVerified(p, cityInfo, { checkIn, travelers });
    verified.push({
      ...enriched,
      priceNote:
        priority === "value" && enriched.pricePerPerson > 0
          ? `性价比推荐 ¥${enriched.pricePerPerson}/晚 · 备选有更低价`
          : enriched.priceNote,
    });
  }
  return verified;
}

/** 解析用户特殊需求关键词 */
export function parseNotesKeywords(notes?: string): string[] {
  if (!notes?.trim()) return [];
  const keywords: string[] = [];
  const patterns: [RegExp, string][] = [
    [/妆造|化妆造型|古风妆/, "汉服妆造"],
    [/汉服|古装|旗袍/, "汉服体验"],
    [/写真|旅拍|拍照/, "旅拍摄影"],
    [/温泉|泡汤/, "温泉"],
    [/夜景|夜市/, "夜市"],
    [/亲子|儿童/, "亲子"],
  ];
  for (const [re, kw] of patterns) {
    if (re.test(notes)) keywords.push(kw);
  }
  // 提取引号或「」内的自定义词
  const quoted = notes.match(/[「『"]([^」』"]+)[」』"]/g);
  if (quoted) {
    for (const q of quoted) keywords.push(q.replace(/[「『"」』]/g, ""));
  }
  return [...new Set(keywords)];
}

/** 按特殊需求搜索 POI */
export async function fetchSpecialPOIs(cityInfo: CityInfo, keywords: string[]): Promise<POI[]> {
  const all: POI[] = [];
  for (const kw of keywords) {
    const pois = await searchPOI({ keywords: `${cityInfo.name} ${kw}`, city: cityInfo.name, offset: 10 });
    for (const p of pois) {
      const mapped = amapToPOI(p, "attraction", "mixed", cityInfo.name);
      if (mapped) all.push(mapped);
    }
  }
  const deduped = dedupePOIs(all).sort((a, b) => b.rating - a.rating);
  const verified: POI[] = [];
  for (const p of deduped.slice(0, 3)) {
    verified.push(await enrichPOIVerified(p, cityInfo));
  }
  return verified;
}

/** 按必去名称搜索并匹配 POI */
export async function fetchMustVisitPOIs(
  cityInfo: CityInfo,
  names: string[],
  travelers = 2,
): Promise<POI[]> {
  const out: POI[] = [];
  for (const name of names) {
    const pois = await searchPOI({ keywords: `${cityInfo.name} ${name}`, city: cityInfo.name, offset: 8 });
    let best: POI | null = null;
    for (const p of pois) {
      const mapped = amapToPOI(p, "attraction", "mixed", cityInfo.name, undefined, undefined, travelers);
      if (!mapped) continue;
      if (mapped.name.includes(name) || name.includes(mapped.name.replace(/景区|风景区/g, ""))) {
        best = mapped;
        break;
      }
    }
    if (best) out.push(await enrichPOIVerified(await enrichPhotos(best), cityInfo));
  }
  return dedupePOIs(out);
}

function get5aSearchTerms(cityName: string): string[] {
  const city = cityName.replace(/市|区|县$/g, "");
  const terms: string[] = [];
  for (const s of scenicList as Array<{ city: string; name: string; keywords: string[] }>) {
    if (s.city.includes(city) || city.includes(s.city.replace(/市$/g, ""))) {
      terms.push(s.name, ...s.keywords.slice(0, 2));
    }
  }
  return [...new Set(terms)].slice(0, 8);
}

async function enrichPhotos(poi: POI): Promise<POI> {
  if (poi.photoUrls && poi.photoUrls.length >= 2) return poi;
  try {
    const detail = await fetchPOIDetail(poi.id);
    const urls = (detail?.photos ?? []).map((p) => p.url).filter(Boolean).slice(0, 4);
    if (urls.length === 0) return poi;
    return { ...poi, photoUrl: urls[0], photoUrls: urls };
  } catch {
    return poi;
  }
}

export interface AttractionFetchResult {
  pool: POI[];
  topRanked: RankedAttraction[];
}

export async function fetchRealAttractions(
  cityInfo: CityInfo,
  style: TravelStyle,
  limit: number,
  opts?: {
    priority?: AttractionRankContext["priority"];
    budget?: BudgetLevel;
    totalBudget?: number;
    travelers?: number;
    maxTicketPerPerson?: number;
  },
): Promise<AttractionFetchResult> {
  const cacheId = cacheKey([
    "attr",
    cityInfo.adcode,
    style,
    String(limit),
    opts?.priority ?? "value",
    opts?.budget ?? "moderate",
    String(opts?.totalBudget ?? 0),
  ]);
  const cached = storeGetSync<AttractionFetchResult>(cacheId);
  if (cached) return cached;

  const fast = isServerlessFastPath();
  const keywords = fast
    ? [...STYLE_KEYWORDS[style]].slice(0, 3)
    : [...STYLE_KEYWORDS[style], ...get5aSearchTerms(cityInfo.name)];
  const all: POI[] = [];
  const searchLimit = pLimit(2);

  await Promise.all(
    keywords.map((kw) =>
      searchLimit(async () => {
        const pois = await searchPOI({ keywords: kw, city: cityInfo.name, types: "110000", offset: 25 });
        for (const p of pois) {
          const mapped = amapToPOI(p, "attraction", style, cityInfo.name);
          if (mapped) all.push(mapped);
        }
      }),
    ),
  );

  if (all.length < limit) {
    const cityShort = cityInfo.name.replace(/市|区|县$/g, "");
    const fallback = [
      `${cityShort}必去`,
      `${cityShort}旅游`,
      `${cityShort}博物馆`,
      `${cityShort}公园`,
      `${cityShort}古镇`,
      "世界遗产",
      "国家级",
    ];
    for (const kw of fallback) {
      const pois = await searchPOI({ keywords: kw, city: cityInfo.name, types: "110000", offset: 20 });
      for (const p of pois) {
        const mapped = amapToPOI(p, "attraction", style, cityInfo.name);
        if (mapped) all.push(mapped);
      }
      if (dedupePOIs(all).length >= limit) break;
    }
  }

  const deduped = dedupePOIs(all);
  const rankCtx: AttractionRankContext = {
    cityName: cityInfo.name,
    style,
    priority: opts?.priority ?? "value",
    budget: opts?.budget ?? "moderate",
    totalBudget: opts?.totalBudget,
  };

  const topRanked = rankAttractions(deduped, rankCtx, Math.max(15, limit));
  const fetchCount = Math.max(limit + 8, topRanked.length);

  const ordered = topRanked.map((r) => r.poi);
  const rest = deduped.filter((p) => !ordered.some((o) => o.id === p.id));
  const candidates = [...ordered, ...rest].slice(0, fetchCount);

  let verified: POI[];
  if (fast) {
    verified = candidates.map((poi) => ({
      ...poi,
      links: buildPOILinks(poi, cityInfo, {}),
      priceNote: poi.priceNote ?? "线上精简：生成后点链接查实价",
    }));
  } else {
    const enrichLimit = pLimit(3);
    verified = await Promise.all(
      candidates.map((poi) =>
        enrichLimit(async () => {
          const withPhoto = await enrichPhotos(poi);
          return enrichPOIVerified(withPhoto, cityInfo, { travelers: opts?.travelers ?? 2 });
        }),
      ),
    );
  }

  const maxTicket = opts?.maxTicketPerPerson ?? 0;
  const filtered =
    maxTicket > 0
      ? verified.filter((p) => p.pricePerPerson <= 0 || p.pricePerPerson <= maxTicket)
      : verified;

  const topWithLinks = topRanked.slice(0, 15).map((item, i) => {
    const enriched = filtered.find((p) => p.id === item.poi.id) ?? item.poi;
    return { ...item, rank: i + 1, poi: enriched };
  });

  const result = { pool: filtered.slice(0, fetchCount), topRanked: topWithLinks };
  storeSetSync(cacheId, result, CACHE_TTL.poi);
  return result;
}

export async function fetchNearbyRestaurants(
  location: string,
  cityInfo: CityInfo,
  mealTime: MealTime,
  limit: number,
  mealPref?: MealPref,
  budget?: BudgetLevel,
  dietary?: string[],
): Promise<POI[]> {
  const keywords = getMealKeywords(cityInfo.name, mealTime, mealPref, budget, dietary);
  const all: POI[] = [];

  for (const kw of keywords) {
    const pois = await searchAround({ location, keywords: kw, types: "050000", radius: 3500 });
    for (const p of pois) {
      const mapped = amapToPOI(p, "restaurant", "food", cityInfo.name, mealTime, budget);
      if (mapped && isQualityRestaurant(mapped, mealTime, mealPref, budget, dietary)) all.push(mapped);
    }
  }

  const ranked = dedupePOIs(all)
    .sort((a, b) => {
      const dietBoost = (p: POI) => (dietary?.length && matchesDietary(p, dietary) ? 5 : 0);
      return mealValueScore(b) + dietBoost(b) - (mealValueScore(a) + dietBoost(a));
    })
    .slice(0, limit + 3);

  const verified: POI[] = [];
  for (const p of ranked.slice(0, Math.min(6, ranked.length))) {
    verified.push(await enrichPOIVerified(p, cityInfo));
  }
  return verified.length > 0 ? verified : ranked;
}

export async function fetchRealWeatherForecast(
  cityInfo: CityInfo,
  startDate: string,
  days: number,
): Promise<WeatherForecast[]> {
  const casts = await fetchWeatherForecast(cityInfo.cityAdcode);
  const forecasts: WeatherForecast[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const cast = casts.find((c) => c.date === dateStr) ?? casts[i] ?? casts[0];
    if (cast) {
      const condition = mapWeatherCondition(cast.dayweather);
      forecasts.push({
        date: dateStr,
        condition,
        tempHigh: parseInt(cast.daytemp, 10) || 25,
        tempLow: parseInt(cast.nighttemp, 10) || 18,
        rainProbability: condition === "rainy" ? 70 : 30,
      });
    } else {
      forecasts.push({ date: dateStr, condition: "cloudy", tempHigh: 25, tempLow: 18, rainProbability: 20 });
    }
  }
  return forecasts;
}

export { resolveCityInfo };
