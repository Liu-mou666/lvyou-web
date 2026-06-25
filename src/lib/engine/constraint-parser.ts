import type { TripRequest } from "../types";

export interface PlanningConstraints {
  mustVisit: string[];
  exclude: string[];
  specialKeywords: string[];
  dietary: string[];
  accessibility: boolean;
  withChildren: boolean;
  withElderly: boolean;
}

const MUST_VISIT_PATTERNS = [
  /必去[：:]?\s*([^，。；\n]+)/,
  /一定要去[：:]?\s*([^，。；\n]+)/,
  /必须去[：:]?\s*([^，。；\n]+)/,
];

const EXCLUDE_PATTERNS = [
  /不去[：:]?\s*([^，。；\n]+)/,
  /避开[：:]?\s*([^，。；\n]+)/,
  /不要[：:]?\s*([^，。；\n]+)/,
];

function splitNames(text: string): string[] {
  return text
    .split(/[、,，/|\+]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 30);
}

function extractByPatterns(notes: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const re of patterns) {
    const m = notes.match(re);
    if (m?.[1]) out.push(...splitNames(m[1]));
  }
  return out;
}

/** 从 notes 与表单字段解析规划约束 */
export function parsePlanningConstraints(request: TripRequest): PlanningConstraints {
  const notes = request.notes?.trim() ?? "";
  const quoted = notes.match(/[「『"]([^」』"]+)[」』"]/g)?.map((q) => q.replace(/[「『"」』]/g, "")) ?? [];

  const mustFromNotes = extractByPatterns(notes, MUST_VISIT_PATTERNS);
  const mustVisit = [...new Set([...(request.mustVisit ?? []), ...mustFromNotes, ...quoted.filter((q) => /必去|一定|必须/.test(notes) && notes.includes(q))])];

  const excludeFromNotes = extractByPatterns(notes, EXCLUDE_PATTERNS);
  const exclude = [...new Set([...(request.exclude ?? []), ...excludeFromNotes])];

  const specialKeywords: string[] = [];
  const patterns: [RegExp, string][] = [
    [/妆造|化妆造型|古风妆/, "汉服妆造"],
    [/汉服|古装|旗袍/, "汉服体验"],
    [/写真|旅拍|拍照/, "旅拍摄影"],
    [/温泉|泡汤/, "温泉"],
    [/夜景|夜市/, "夜市"],
    [/亲子|儿童|带娃/, "亲子"],
  ];
  for (const [re, kw] of patterns) {
    if (re.test(notes)) specialKeywords.push(kw);
  }

  const dietary: string[] = [];
  if (/不吃辣|忌辣|无辣|微辣/.test(notes)) dietary.push("不辣");
  if (/清真|回族/.test(notes)) dietary.push("清真");
  if (/素食|吃素|全素/.test(notes)) dietary.push("素食");
  if (request.dietary?.length) {
    for (const d of request.dietary) {
      if (!dietary.includes(d)) dietary.push(d);
    }
  }

  return {
    mustVisit: mustVisit.filter(Boolean),
    exclude: exclude.filter(Boolean),
    specialKeywords: [...new Set(specialKeywords)],
    dietary,
    accessibility: request.accessibility ?? /轮椅|无障碍|老人行动不便/.test(notes),
    withChildren: request.withChildren ?? /带娃|亲子|儿童|宝宝/.test(notes),
    withElderly: request.withElderly ?? /老人|父母|长辈|轮椅/.test(notes),
  };
}

/** POI 是否匹配必去名称 */
export function poiMatchesName(poiName: string, target: string): boolean {
  const a = poiName.replace(/\s/g, "");
  const b = target.replace(/\s/g, "");
  return a.includes(b) || b.includes(a) || a.replace(/景区|风景区|公园/g, "").includes(b);
}

export function filterExcluded(pois: import("../types").POI[], exclude: string[]): import("../types").POI[] {
  if (exclude.length === 0) return pois;
  return pois.filter((p) => !exclude.some((e) => poiMatchesName(p.name, e)));
}

const SPICY_HINT = /辣|川湘|麻辣|火锅|水煮|剁椒|香锅|串串|湘菜|川菜|贵州菜/;
const HALAL_HINT = /清真|回族|兰州拉面|西北|新疆|牛羊肉/;
const MEAT_HINT = /烤肉|牛排|海鲜|涮肉|烤鸭|烧腊|猪|牛|羊|鸡|鸭|鱼|虾|蟹|荤/;
const VEG_HINT = /素|蔬|斋|豆腐|菌菇|沙拉|轻食/;

/** 餐饮是否满足饮食约束 */
export function matchesDietary(poi: import("../types").POI, dietary: string[]): boolean {
  if (dietary.length === 0) return true;
  const text = `${poi.name}${poi.signature ?? ""}${poi.description ?? ""}`;

  if (dietary.includes("清真")) {
    if (/猪|非清真|川湘|麻辣/.test(text)) return false;
    if (HALAL_HINT.test(text)) return true;
    return !MEAT_HINT.test(text) || HALAL_HINT.test(text);
  }
  if (dietary.includes("素食")) {
    if (MEAT_HINT.test(text) && !VEG_HINT.test(text)) return false;
    if (VEG_HINT.test(text)) return true;
    return !MEAT_HINT.test(text);
  }
  if (dietary.includes("不辣")) {
    if (SPICY_HINT.test(text)) return false;
  }
  return true;
}

/** 无障碍：过滤陡坡/索道等不适合轮椅的 POI */
export function filterAccessibility(pois: import("../types").POI[]): import("../types").POI[] {
  const bad = /索道|缆车|登山|攀岩|玻璃栈道|天梯|蹦极|漂流|越野|骑马/;
  return pois.filter((p) => !bad.test(p.name) && !bad.test(p.description ?? ""));
}

export function injectMustVisit(
  pool: import("../types").POI[],
  mustVisitNames: string[],
): import("../types").POI[] {
  if (mustVisitNames.length === 0) return pool;
  const result = [...pool];
  const used = new Set(result.map((p) => p.id || p.name));
  for (const name of mustVisitNames) {
    const found = result.find((p) => poiMatchesName(p.name, name));
    if (found) continue;
    // 占位：名称标记，后续 fetch 会补全
    if (!used.has(name)) {
      result.unshift({
        id: `must-${name}`,
        name,
        type: "attraction",
        category: "mixed",
        lat: 0,
        lng: 0,
        durationMinutes: 120,
        cost: 0,
        pricePerPerson: 0,
        rating: 4.5,
        reviewCount: 0,
        reviewCountEstimated: false,
        openTime: "09:00",
        closeTime: "18:00",
        indoor: false,
        description: "您的必去景点",
        tips: "",
      });
      used.add(name);
    }
  }
  return result;
}
