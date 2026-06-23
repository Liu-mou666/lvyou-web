import scenicList from "@/data/scenic-5a.json";

export interface AuthorityScenic {
  name: string;
  city: string;
  level: "5A" | "4A";
  keywords: string[];
}

const SCENICS = scenicList as AuthorityScenic[];

/** 匹配 POI 是否属于文旅部 5A/4A 名录 */
export function matchAuthorityTag(poiName: string, cityName: string): { tag: string; level: string; officialName: string } | null {
  const name = poiName.replace(/[（(【\[].*?[）)\]】]/g, "").trim();
  const city = cityName.replace(/市|区|县$/g, "");

  for (const s of SCENICS) {
    const cityMatch = s.city.includes(city) || city.includes(s.city.replace(/市$/g, ""));
    if (!cityMatch && !s.keywords.some((k) => name.includes(k))) continue;

    if (name.includes(s.name.replace(/风景名胜区|景区|公园/g, "").slice(0, 4)) || s.keywords.some((k) => name.includes(k))) {
      return { tag: `${s.level} 景区`, level: s.level, officialName: s.name };
    }
  }
  return null;
}

export function authorityBonus(poiName: string, cityName: string): number {
  const m = matchAuthorityTag(poiName, cityName);
  if (!m) return 0;
  return m.level === "5A" ? 25 : 12;
}
