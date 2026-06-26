import { storeGetSync, storeSetSync } from "../cache/store";
import { cacheKey, CACHE_TTL } from "../cache/memory";
import { otaFetch } from "./http-fetch";

export interface CtripCityEntry {
  name: string;
  cityId: number;
  /** 括号内上级市，如 慈利(张家界) */
  parent?: string;
}

const INDEX_CACHE_KEY = cacheKey(["ctrip-city-index-v1"]);

/** 从携程酒店城市列表页解析全国 cityId（约 2000+ 城/县） */
export async function loadCtripCityIndex(): Promise<CtripCityEntry[]> {
  const cached = storeGetSync<CtripCityEntry[]>(INDEX_CACHE_KEY);
  if (cached && cached.length > 100) return cached;

  const html = await otaFetch("https://m.ctrip.com/webapp/hotel/sitemap/citylist/", {
    headers: { Accept: "text/html" },
  });
  if (!html) return cached ?? [];

  const entries: CtripCityEntry[] = [];
  // HTML: <a href="/webapp/hotel/hangzhou17" title="杭州酒店">杭州酒店</a>
  const re = /href="\/webapp\/hotel\/[^"]*?(\d+)"\s+title="([^"]+?)酒店"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const cityId = parseInt(m[1], 10);
    const raw = m[2].trim();
    if (!cityId || cityId < 1) continue;

    const paren = raw.match(/^(.+?)\((.+)\)$/);
    if (paren) {
      entries.push({ name: paren[1].trim(), cityId, parent: paren[2].trim() });
    } else {
      entries.push({ name: raw, cityId });
    }
  }

  if (entries.length > 50) {
    storeSetSync(INDEX_CACHE_KEY, entries, CACHE_TTL.poi * 24);
  }
  return entries;
}

function normCity(s: string): string {
  return s.replace(/市|区|县|自治州|地区|盟$/g, "").trim();
}

/** 按城市名解析携程 cityId（全国） */
export async function resolveCtripCityId(cityName: string): Promise<number | null> {
  const target = normCity(cityName);
  if (!target) return null;

  const index = await loadCtripCityIndex();
  if (index.length === 0) return null;

  // 精确匹配地级市
  const exact = index.find((e) => normCity(e.name) === target && !e.parent);
  if (exact) return exact.cityId;

  // 带「市」后缀
  const withSuffix = index.find((e) => e.name === cityName.replace(/市$/, "") || e.name === target);
  if (withSuffix) return withSuffix.cityId;

  // 县级归属上级市
  const county = index.find((e) => normCity(e.name) === target && e.parent);
  if (county) return county.cityId;

  // 模糊：名称包含
  const fuzzy = index.find(
    (e) => !e.parent && (normCity(e.name).includes(target) || target.includes(normCity(e.name))),
  );
  return fuzzy?.cityId ?? null;
}

/** 同步读缓存索引（需先 loadCtripCityIndex） */
export function resolveCtripCityIdSync(cityName: string): number | null {
  const cached = storeGetSync<CtripCityEntry[]>(INDEX_CACHE_KEY);
  if (!cached?.length) return null;

  const target = normCity(cityName);
  const exact = cached.find((e) => normCity(e.name) === target && !e.parent);
  if (exact) return exact.cityId;

  const withSuffix = cached.find((e) => e.name === cityName.replace(/市$/, "") || e.name === target);
  if (withSuffix) return withSuffix.cityId;

  const county = cached.find((e) => normCity(e.name) === target && e.parent);
  if (county) return county.cityId;

  const fuzzy = cached.find(
    (e) => !e.parent && (normCity(e.name).includes(target) || target.includes(normCity(e.name))),
  );
  return fuzzy?.cityId ?? null;
}

/** 全国 cityId：加载索引后解析 */
export async function resolveCtripCityIdBest(cityName: string): Promise<number | null> {
  const fromCache = resolveCtripCityIdSync(cityName);
  if (fromCache) return fromCache;
  return resolveCtripCityId(cityName);
}
