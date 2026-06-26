import { CITY_ADCODES, SUPPORTED_CITIES } from "./config";

export function localCitySuggestTips(query: string): Array<{ name: string; district: string }> {
  const q = query.trim();
  if (q.length < 1) return [];

  const matched = SUPPORTED_CITIES.filter(
    (name) => name.includes(q) || q.includes(name) || name.startsWith(q),
  );

  const extras: string[] = [];
  for (const key of Object.keys(CITY_ADCODES)) {
    if (key.includes(q) || q.includes(key)) {
      if (!matched.includes(key)) extras.push(key);
    }
  }

  return [...matched, ...extras]
    .slice(0, 8)
    .map((name) => ({
      name,
      district: "国内城市 · 本地索引",
    }));
}
