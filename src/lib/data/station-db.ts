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
  const q = normalize(input);
  if (!q) return null;

  let exact = STATIONS.find((s) => normalize(s.name) === q);
  if (exact) return exact;

  exact = STATIONS.find(
    (s) => s.aliases.some((a) => normalize(a) === q) || normalize(s.name).includes(q) || q.includes(normalize(s.name)),
  );
  if (exact) return exact;

  const partial = STATIONS.filter(
    (s) => s.name.includes(q) || q.includes(normalize(s.name)) || s.aliases.some((a) => a.includes(q) || q.includes(a)),
  );
  if (partial.length === 0) return null;

  return partial.sort((a, b) => a.hubTier - b.hubTier)[0];
}

/** 购票用站点：优先高铁站（如 张家界→张家界西） */
export function resolveTrainStation(input: string): RailStation | null {
  const q = normalize(input);
  if (!q) return null;

  // 已知城市 → 高铁主站映射
  const cityToHsr: Record<string, string> = {
    张家界: "张家界西",
    长沙: "长沙南",
    昆明: "昆明南",
    贵阳: "贵阳北",
    成都: "成都东",
    重庆: "重庆北",
    西安: "西安北",
    郑州: "郑州东",
    武汉: "汉口",
    苏州: "苏州",
    上海: "上海虹桥",
  };

  for (const [city, hsr] of Object.entries(cityToHsr)) {
    if (q.includes(city) || city.includes(q)) {
      const st = STATIONS.find((s) => s.name === hsr);
      if (st) return st;
    }
  }

  const base = resolveStation(input);
  if (!base) return null;

  // 同城市有 XX西/XX南 则优先
  const hsrVariant = STATIONS.find(
    (s) =>
      s.name.startsWith(base.name) &&
      s.name !== base.name &&
      (s.name.endsWith("西") || s.name.endsWith("南") || s.name.includes("虹桥")) &&
      s.hubTier <= base.hubTier + 1,
  );
  return hsrVariant ?? base;
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
