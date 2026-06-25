import type {
  BudgetLevel,
  DayStartPref,
  MealPref,
  PriorityMode,
  SeatPref,
  TransportPref,
  TravelPace,
  TravelStyle,
} from "./types";

export const PACE_ATTRACTIONS: Record<TravelPace, number> = {
  relaxed: 2,
  normal: 3,
  intense: 4,
};

export const STYLES: { value: TravelStyle; label: string; desc: string; hint: string }[] = [
  { value: "mixed", label: "综合", desc: "景点+美食+自然", hint: "影响景点关键词与排序" },
  { value: "culture", label: "人文", desc: "博物馆、古迹", hint: "偏重博物馆、古迹类 POI" },
  { value: "food", label: "美食", desc: "本地特色", hint: "餐饮推荐权重提高" },
  { value: "nature", label: "自然", desc: "公园、山景", hint: "公园、湿地、山景优先" },
  { value: "shopping", label: "购物", desc: "步行街、商圈", hint: "商圈、步行街纳入候选" },
];

export const PACES: { value: TravelPace; label: string; desc: string; hint: string }[] = [
  { value: "relaxed", label: "轻松 2景", desc: "每天 2 景点", hint: "适合带娃/老人，行程宽松" },
  { value: "normal", label: "标准 3景", desc: "每天 3 景点", hint: "大多数用户推荐" },
  { value: "intense", label: "紧凑 4景", desc: "每天 4 景点", hint: "体力好、想多逛" },
];

export const BUDGETS: { value: BudgetLevel; label: string; desc: string; hint: string }[] = [
  { value: "budget", label: "经济", desc: "约 ¥80–120/晚", hint: "仅在不填总预算时生效" },
  { value: "moderate", label: "适中", desc: "约 ¥160–280/晚", hint: "仅在不填总预算时生效" },
  { value: "luxury", label: "品质", desc: "约 ¥280–600/晚", hint: "仅在不填总预算时生效" },
];

export const PRIORITIES: { value: PriorityMode; label: string; desc: string; hint: string }[] = [
  { value: "value", label: "省钱", desc: "性价比优先", hint: "火车选低价、景点偏免费/低价" },
  { value: "time", label: "省时", desc: "距离优先", hint: "景点路线更短、市内少绕路" },
  { value: "experience", label: "体验", desc: "高评分优先", hint: "高分景点与口碑店优先" },
];

export const TRANSPORTS: { value: TransportPref; label: string; desc: string }[] = [
  { value: "transit", label: "地铁公交", desc: "公共交通为主" },
  { value: "taxi", label: "打车", desc: "少走路、省时" },
  { value: "walk", label: "步行", desc: "2km 内多步行" },
  { value: "mixed", label: "自动", desc: "地铁优先，远了打车" },
];

export const MEALS: { value: MealPref; label: string; desc: string }[] = [
  { value: "local", label: "本地特色", desc: "老字号、本地菜" },
  { value: "fast", label: "快餐", desc: "简餐、连锁" },
  { value: "any", label: "不限", desc: "评分优先" },
];

export const STATION_MODES: { value: "auto" | "hsr" | "classic"; label: string; desc: string }[] = [
  { value: "auto", label: "自动多站", desc: "同城所有火车站都试" },
  { value: "hsr", label: "优先高铁", desc: "西/南/虹桥等高铁站优先" },
  { value: "classic", label: "优先普速", desc: "张家界站等普速站优先" },
];

export const DAY_STARTS: { value: DayStartPref; label: string; desc: string }[] = [
  { value: "early", label: "早起 7:00", desc: "适合赶早班火车" },
  { value: "normal", label: "常规 8:00", desc: "大多数行程" },
  { value: "late", label: "悠闲 9:00", desc: "不赶早" },
];

export const SEAT_PREFS: { value: SeatPref; label: string; desc: string }[] = [
  { value: "second", label: "二等座", desc: "性价比最高" },
  { value: "first", label: "一等座", desc: "更舒适" },
  { value: "any", label: "不限", desc: "有票优先" },
];

export const DIETARY_OPTS: { value: "不辣" | "清真" | "素食"; label: string }[] = [
  { value: "不辣", label: "不吃辣" },
  { value: "清真", label: "清真" },
  { value: "素食", label: "素食" },
];

export const STRATEGY_PRESETS: {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  patch: Partial<{
    pace: TravelPace;
    priority: PriorityMode;
    style: TravelStyle;
    budget: BudgetLevel;
    transportPref: TransportPref;
    mealPref: MealPref;
    avoidCrowd: boolean;
    withChildren: boolean;
    withElderly: boolean;
    accessibility: boolean;
    preferDirectTrain: boolean;
    dayStart: DayStartPref;
    maxWalkKmPerDay: number;
    maxHotelPerNight: number;
  }>;
}[] = [
  {
    id: "family",
    label: "带娃轻松",
    emoji: "👶",
    desc: "慢节奏·避人流",
    patch: {
      pace: "relaxed",
      priority: "time",
      withChildren: true,
      avoidCrowd: true,
      transportPref: "taxi",
      maxWalkKmPerDay: 5,
    },
  },
  {
    id: "budget",
    label: "省钱穷游",
    emoji: "💰",
    desc: "性价比·公交",
    patch: {
      priority: "value",
      pace: "normal",
      budget: "budget",
      transportPref: "transit",
      preferDirectTrain: true,
      maxHotelPerNight: 120,
    },
  },
  {
    id: "intense",
    label: "特种兵",
    emoji: "🏃",
    desc: "紧凑·省时",
    patch: {
      pace: "intense",
      priority: "time",
      dayStart: "early",
      transportPref: "mixed",
      avoidCrowd: false,
    },
  },
  {
    id: "culture",
    label: "深度人文",
    emoji: "🏛️",
    desc: "博物馆·古迹",
    patch: {
      style: "culture",
      priority: "experience",
      pace: "relaxed",
      avoidCrowd: true,
    },
  },
  {
    id: "photo",
    label: "网红打卡",
    emoji: "📸",
    desc: "高分景点",
    patch: {
      style: "mixed",
      priority: "experience",
      pace: "normal",
      avoidCrowd: false,
    },
  },
];

export function budgetLevelLabel(level: BudgetLevel): string {
  return BUDGETS.find((b) => b.value === level)?.label ?? level;
}
