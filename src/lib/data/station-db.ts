import stations from "@/data/stations.json";
import {
  ctripTrainSearchUrl,
  fliggyTrainSearchUrl,
  link12306Search,
} from "./platform-urls";

export interface RailStation {
  name: string;
  aliases: string[];
  telecode: string;
  lng: number;
  lat: number;
  hubTier: number;
  region: string;
}

const STATIONS = stations as RailStation[];

function normalize(s: string): string {
  return s.replace(/站$/g, "").replace(/市$/g, "").trim();
}

/** 解析城市/地名 → 最佳铁路站点 */
export function resolveStation(input: string): RailStation | null {
  const list = listStationsForCity(input);
  return list[0] ?? null;
}

/** 同城全部铁路站，可按偏好排序 */
export function sortStationsByMode(
  stations: RailStation[],
  mode: "auto" | "hsr" | "classic" = "auto",
): RailStation[] {
  const list = [...stations];
  if (mode === "auto") {
    return list.sort((a, b) => a.hubTier - b.hubTier);
  }
  if (mode === "hsr") {
    return list.sort((a, b) => {
      const score = (s: RailStation) =>
        /西$|南$|东$|虹桥/.test(s.name) ? 0 : s.hubTier <= 2 ? 1 : 2;
      return score(a) - score(b) || a.hubTier - b.hubTier;
    });
  }
  // classic: 普速主站（名称短、无方位后缀）优先
  return list.sort((a, b) => {
    const score = (s: RailStation) => {
      const n = s.name.replace(/站$/, "");
      if (n.endsWith("西") || n.endsWith("南") || n.endsWith("北") || n.endsWith("东")) return 2;
      if (s.hubTier >= 3) return 0;
      return 1;
    };
    return score(a) - score(b);
  });
}

export function listStationsForCity(input: string, mode: "auto" | "hsr" | "classic" = "auto"): RailStation[] {
  const q = normalize(input);
  if (!q) return [];

  const matched = STATIONS.filter(
    (s) =>
      normalize(s.name) === q ||
      normalize(s.name).includes(q) ||
      q.includes(normalize(s.name)) ||
      s.aliases.some((a) => normalize(a) === q || q.includes(normalize(a)) || normalize(a).includes(q)),
  );

  const seen = new Set<string>();
  const unique: RailStation[] = [];
  for (const s of matched.sort((a, b) => a.hubTier - b.hubTier)) {
    if (!seen.has(s.telecode)) {
      seen.add(s.telecode);
      unique.push(s);
    }
  }
  return sortStationsByMode(unique, mode);
}

/** 12306 / 聚合 API 可识别的站名变体 */
export function stationQueryNames(st: RailStation): string[] {
  const names = new Set<string>([st.name, ...st.aliases]);
  const base = st.name.replace(/站$/g, "");
  if (base.endsWith("西") || base.endsWith("南") || base.endsWith("北") || base.endsWith("东")) {
    names.add(base.slice(0, -1));
  }
  return [...names];
}

/** 购票用站点：返回同城候选中的主站（不再硬绑单一高铁站） */
export function resolveTrainStation(input: string): RailStation | null {
  const candidates = listStationsForCity(input);
  if (candidates.length > 0) return candidates[0];

  const q = normalize(input);
  if (!q) return null;

  const partial = STATIONS.filter(
    (s) => s.name.includes(q) || q.includes(normalize(s.name)) || s.aliases.some((a) => a.includes(q)),
  );
  if (partial.length === 0) return null;
  return partial.sort((a, b) => a.hubTier - b.hubTier)[0];
}

export function getHubStations(): RailStation[] {
  return STATIONS.filter((s) => s.hubTier <= 2);
}

export function haversineKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function ctripTrainUrl(fromStation: string, toStation: string, date: string): string {
  return ctripTrainSearchUrl(normalize(fromStation), normalize(toStation), date);
}

export function fliggyTrainUrl(fromStation: string, toStation: string, date: string): string {
  return fliggyTrainSearchUrl(normalize(fromStation), normalize(toStation), date);
}

/** 12306 官方查票页（站名,电报码） */
export function link12306(fromSt: RailStation, toSt: RailStation, date: string): string {
  return link12306Search(fromSt.name, fromSt.telecode, toSt.name, toSt.telecode, date);
}

export function ctripFlightUrl(fromCity: string, toCity: string, date: string): string {
  return `https://flights.ctrip.com/online/list/oneway-${encodeURIComponent(fromCity)}-${encodeURIComponent(toCity)}?depdate=${encodeURIComponent(date)}&cabin=y_s`;
}

export { STATIONS };
