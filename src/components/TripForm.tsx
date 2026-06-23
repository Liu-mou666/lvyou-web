"use client";

import type {
  BudgetLevel,
  MealPref,
  PriorityMode,
  TransportPref,
  TravelPace,
  TravelStyle,
  TripRequest,
} from "@/lib/types";
import { inferBudgetLevelFromTotal } from "@/lib/engine/budget-planner";
import { useState } from "react";

interface TripFormProps {
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
}

const STYLES: { value: TravelStyle; label: string; desc: string }[] = [
  { value: "mixed", label: "综合", desc: "景点+美食+自然均衡搭配" },
  { value: "culture", label: "人文历史", desc: "博物馆、古迹、历史街区" },
  { value: "food", label: "美食探店", desc: "本地特色、老字号、网红店" },
  { value: "nature", label: "自然风光", desc: "公园、湿地、山景" },
  { value: "shopping", label: "购物休闲", desc: "步行街、商圈" },
];

const PACES: { value: TravelPace; label: string; desc: string }[] = [
  { value: "relaxed", label: "轻松", desc: "每天 2 个景点 + 三餐" },
  { value: "normal", label: "标准", desc: "每天 3 个景点 + 三餐" },
  { value: "intense", label: "紧凑", desc: "每天 4 个景点 + 三餐" },
];

const BUDGETS: { value: BudgetLevel; label: string; desc: string }[] = [
  { value: "budget", label: "经济", desc: "酒店 ≤120 · 餐 ≤80" },
  { value: "moderate", label: "适中", desc: "酒店 ≤280 · 餐 ≤150" },
  { value: "luxury", label: "品质", desc: "酒店 ≤600 · 不限餐" },
];

const PRIORITIES: { value: PriorityMode; label: string; desc: string }[] = [
  { value: "value", label: "省钱优先", desc: "预算约束 + 性价比权重" },
  { value: "time", label: "省时优先", desc: "距离近、排队短" },
  { value: "experience", label: "体验优先", desc: "高评分、热门必去" },
];

const TRANSPORTS: { value: TransportPref; label: string }[] = [
  { value: "transit", label: "地铁公交" },
  { value: "taxi", label: "打车为主" },
  { value: "walk", label: "步行优先" },
  { value: "mixed", label: "自动推荐" },
];

const MEALS: { value: MealPref; label: string }[] = [
  { value: "local", label: "本地特色" },
  { value: "fast", label: "快餐简餐" },
  { value: "any", label: "不限" },
];

function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  columns = 3,
}: {
  name: string;
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  const gridCls =
    columns === 2
      ? "grid-cols-2"
      : columns === 4
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className={`grid gap-2 ${gridCls}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`cursor-pointer rounded-xl border p-3 transition-all active:scale-[0.98] ${
            value === opt.value
              ? "border-warm-500 bg-warm-glow shadow-sm shadow-warm-500/10 ring-1 ring-warm-400/30"
              : "border-warm-200 bg-white hover:border-warm-300"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="block text-sm font-medium text-warm-text">{opt.label}</span>
          {opt.desc && <span className="mt-0.5 block text-[11px] leading-snug text-warm-muted sm:text-xs">{opt.desc}</span>}
        </label>
      ))}
    </div>
  );
}

export default function TripForm({ onSubmit, loading }: TripFormProps) {
  const today = new Date().toISOString().split("T")[0];
  const [city, setCity] = useState("北京");
  const [departureCity, setDepartureCity] = useState("上海");
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState(3);
  const [style, setStyle] = useState<TravelStyle>("mixed");
  const [pace, setPace] = useState<TravelPace>("normal");
  const [budget, setBudget] = useState<BudgetLevel>("moderate");
  const [priority, setPriority] = useState<PriorityMode>("value");
  const [transportPref, setTransportPref] = useState<TransportPref>("mixed");
  const [mealPref, setMealPref] = useState<MealPref>("local");
  const [avoidCrowd, setAvoidCrowd] = useState(true);
  const [maxMealBudget, setMaxMealBudget] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      city: city.trim(),
      departureCity: departureCity.trim(),
      days,
      style,
      pace,
      budget,
      startDate,
      travelers: 2,
      priority,
      transportPref,
      mealPref,
      avoidCrowd,
      maxMealBudget,
      totalBudget,
      notes: notes.trim() || undefined,
    });
  }

  const inputCls =
    "w-full rounded-xl border border-warm-200 bg-white px-4 py-3 text-warm-text outline-none transition focus:border-warm-500 focus:ring-2 focus:ring-warm-500/15 sm:py-2.5";

  const inferredBudget =
    totalBudget > 0 ? inferBudgetLevelFromTotal(totalBudget, days, 2) : null;
  const inferredBudgetLabel = inferredBudget
    ? BUDGETS.find((b) => b.value === inferredBudget)?.label
    : null;

  return (
    <form onSubmit={handleSubmit} className="card-warm p-4 sm:p-5">
      <h2 className="text-base font-semibold text-warm-text">行程参数</h2>
      <p className="mt-1 text-xs text-warm-muted">全国省/市/区县均可 · 每条推荐可查看依据</p>

      <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-warm-muted">出发城市</span>
          <input required value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} className={inputCls} placeholder="如：上海、广州" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-warm-muted">目的地</span>
          <input required value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="如：苏州、丽江" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-warm-muted">出发日期</span>
          <input type="date" required min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-warm-muted">行程天数（1-7 天）</span>
          <input type="number" min={1} max={7} required value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-warm-muted">全程总预算（0=不限）</span>
          <input
            type="number"
            min={0}
            step={500}
            value={totalBudget}
            onChange={(e) => setTotalBudget(Number(e.target.value))}
            className={inputCls}
            placeholder="如：5000（2人3天）"
          />
          {totalBudget > 0 && (
            <p className="mt-1 text-xs text-warm-500">
              约 ¥{Math.round(totalBudget / days / 2)}/人/天 · 自动匹配「{inferredBudgetLabel}」
            </p>
          )}
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-warm-muted">每餐最高人均（0=不限）</span>
          <input type="number" min={0} step={10} value={maxMealBudget} onChange={(e) => setMaxMealBudget(Number(e.target.value))} className={inputCls} placeholder="如：100" />
        </label>
      </div>

      <fieldset className="mt-4 sm:mt-5">
        <legend className="mb-2 text-sm font-medium text-warm-muted">优化目标</legend>
        <RadioGroup name="priority" options={PRIORITIES} value={priority} onChange={setPriority} columns={3} />
      </fieldset>

      <fieldset className="mt-4 sm:mt-5">
        <legend className="mb-2 text-sm font-medium text-warm-muted">旅行主题</legend>
        <RadioGroup name="style" options={STYLES} value={style} onChange={setStyle} columns={2} />
      </fieldset>

      <fieldset className="mt-4 sm:mt-5">
        <legend className="mb-2 text-sm font-medium text-warm-muted">行程节奏</legend>
        <RadioGroup name="pace" options={PACES} value={pace} onChange={setPace} columns={3} />
      </fieldset>

      <fieldset className="mt-4 sm:mt-5">
        <legend className="mb-2 text-sm font-medium text-warm-muted">
          预算等级
          {inferredBudget && (
            <span className="ml-1 text-xs font-normal text-warm-500">
              （已设总预算 →「{inferredBudgetLabel}」）
            </span>
          )}
        </legend>
        <RadioGroup name="budget" options={BUDGETS} value={budget} onChange={setBudget} columns={3} />
      </fieldset>

      <fieldset className="mt-4 sm:mt-5">
        <legend className="mb-2 text-sm font-medium text-warm-muted">出行方式偏好</legend>
        <RadioGroup name="transport" options={TRANSPORTS} value={transportPref} onChange={setTransportPref} columns={4} />
      </fieldset>

      <fieldset className="mt-4 sm:mt-5">
        <legend className="mb-2 text-sm font-medium text-warm-muted">餐饮偏好</legend>
        <RadioGroup name="meal" options={MEALS} value={mealPref} onChange={setMealPref} columns={3} />
      </fieldset>

      <label className="mt-4 flex cursor-pointer items-center gap-3 sm:mt-5">
        <input
          type="checkbox"
          checked={avoidCrowd}
          onChange={(e) => setAvoidCrowd(e.target.checked)}
          className="h-5 w-5 shrink-0 rounded border-warm-300 text-warm-500 focus:ring-warm-500/20"
        />
        <span className="text-sm text-warm-text">避开高峰人流（降低拥挤景点权重）</span>
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-warm-muted">特殊需求（可选）</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="如：想体验妆造/汉服、不吃辣..." />
      </label>

      <button type="submit" disabled={loading} className="btn-primary mt-5 sm:mt-6">
        {loading ? "正在生成可溯源方案…" : "生成参考行程"}
      </button>
    </form>
  );
}
