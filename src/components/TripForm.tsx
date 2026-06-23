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
import { tripRequestSchema } from "@/lib/validation/trip-schema";
import { useState } from "react";

interface TripFormProps {
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
}

const STYLES: { value: TravelStyle; label: string; desc: string }[] = [
  { value: "mixed", label: "综合", desc: "景点+美食+自然" },
  { value: "culture", label: "人文", desc: "博物馆、古迹" },
  { value: "food", label: "美食", desc: "本地特色" },
  { value: "nature", label: "自然", desc: "公园、山景" },
  { value: "shopping", label: "购物", desc: "步行街、商圈" },
];

const PACES: { value: TravelPace; label: string; desc: string }[] = [
  { value: "relaxed", label: "轻松 2景", desc: "每天 2 景点" },
  { value: "normal", label: "标准 3景", desc: "每天 3 景点" },
  { value: "intense", label: "紧凑 4景", desc: "每天 4 景点" },
];

const BUDGETS: { value: BudgetLevel; label: string; desc: string }[] = [
  { value: "budget", label: "经济", desc: "≤120/晚" },
  { value: "moderate", label: "适中", desc: "≤280/晚" },
  { value: "luxury", label: "品质", desc: "≤600/晚" },
];

const PRIORITIES: { value: PriorityMode; label: string; desc: string }[] = [
  { value: "value", label: "省钱", desc: "性价比" },
  { value: "time", label: "省时", desc: "距离近" },
  { value: "experience", label: "体验", desc: "高评分" },
];

const TRANSPORTS: { value: TransportPref; label: string }[] = [
  { value: "transit", label: "地铁公交" },
  { value: "taxi", label: "打车" },
  { value: "walk", label: "步行" },
  { value: "mixed", label: "自动" },
];

const MEALS: { value: MealPref; label: string }[] = [
  { value: "local", label: "本地特色" },
  { value: "fast", label: "快餐" },
  { value: "any", label: "不限" },
];

function ChipGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  twoCol = true,
}: {
  name: string;
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  twoCol?: boolean;
}) {
  return (
    <div className={`chip-group ${twoCol ? "" : ""}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`chip-option ${!twoCol || options.length <= 3 ? "" : ""} cursor-pointer rounded-xl border px-3 py-3 text-center transition active:scale-[0.97] sm:py-2.5 ${
            value === opt.value
              ? "border-warm-500 bg-warm-glow font-semibold text-warm-700 ring-1 ring-warm-400/40"
              : "border-warm-200 bg-white text-warm-text"
          }`}
        >
          <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} className="sr-only" />
          <span className="block text-sm">{opt.label}</span>
          {opt.desc && <span className="mt-0.5 block text-[10px] text-warm-muted sm:text-xs">{opt.desc}</span>}
        </label>
      ))}
    </div>
  );
}

function DesktopRadioGroup<T extends string>({
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
    columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3";

  return (
    <div className={`hidden sm:grid sm:gap-2 ${gridCls}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`cursor-pointer rounded-xl border p-3 transition ${
            value === opt.value ? "border-warm-500 bg-warm-glow ring-1 ring-warm-400/30" : "border-warm-200 bg-white"
          }`}
        >
          <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} className="sr-only" />
          <span className="block text-sm font-medium text-warm-text">{opt.label}</span>
          {opt.desc && <span className="mt-0.5 block text-xs text-warm-muted">{opt.desc}</span>}
        </label>
      ))}
    </div>
  );
}

function PreferenceField<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  columns = 3,
}: {
  label: string;
  name: string;
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-warm-muted">{label}</legend>
      <div className="sm:hidden">
        <ChipGroup name={`${name}-m`} options={options} value={value} onChange={onChange} twoCol={options.length > 3} />
      </div>
      <DesktopRadioGroup name={name} options={options} value={value} onChange={onChange} columns={columns} />
    </fieldset>
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
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
    };

    const parsed = tripRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    onSubmit({
      ...parsed.data,
      departureCity: parsed.data.departureCity?.trim(),
      travelers: parsed.data.travelers ?? 2,
      notes: parsed.data.notes?.trim() || undefined,
    } as TripRequest);
  }

  const inputCls =
    "w-full min-w-0 rounded-xl border border-warm-200 bg-white px-4 py-3.5 text-warm-text outline-none transition focus:border-warm-500 focus:ring-2 focus:ring-warm-500/15 sm:py-2.5";

  const inferredBudget = totalBudget > 0 ? inferBudgetLevelFromTotal(totalBudget, days, 2) : null;
  const inferredBudgetLabel = inferredBudget ? BUDGETS.find((b) => b.value === inferredBudget)?.label : null;

  return (
    <form onSubmit={handleSubmit} className="card-warm overflow-hidden p-0 sm:p-5">
      <div className="border-b border-warm-200 bg-warm-100/60 px-4 py-3 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0">
        <h2 className="text-base font-semibold text-warm-text">行程参数</h2>
        <p className="mt-0.5 text-xs text-warm-muted">填完点底部橙色按钮生成</p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:space-y-0 sm:px-0">
        {fieldErrors.form && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fieldErrors.form}</p>
        )}
        {/* 核心：手机始终可见 */}
        <div className="grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">从哪出发</span>
            <input required value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} className={inputCls} placeholder="上海、张家界" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">去哪玩</span>
            <input required value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="苏州、丽江" />
            {fieldErrors.city && <p className="mt-1 text-xs text-red-600">{fieldErrors.city}</p>}
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">出发日期</span>
            <input type="date" required min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">玩几天</span>
            <input type="number" min={1} max={7} required value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls} />
            {fieldErrors.days && <p className="mt-1 text-xs text-red-600">{fieldErrors.days}</p>}
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">总预算（0=不限）</span>
            <input type="number" min={0} step={500} value={totalBudget} onChange={(e) => setTotalBudget(Number(e.target.value))} className={inputCls} placeholder="如 5000（2人3天）" />
            {totalBudget > 0 && (
              <p className="mt-1 text-xs text-warm-500">
                ¥{Math.round(totalBudget / days / 2)}/人/天 · 「{inferredBudgetLabel}」
              </p>
            )}
          </label>
        </div>

        {/* 手机：节奏 + 目标 直接展示（最常用） */}
        <div className="space-y-4 sm:mt-5">
          <PreferenceField label="行程节奏" name="pace" options={PACES} value={pace} onChange={setPace} columns={3} />
          <PreferenceField label="优化目标" name="priority" options={PRIORITIES} value={priority} onChange={setPriority} columns={3} />
        </div>

        {/* 手机：更多选项折叠 */}
        <details className="mobile-collapse sm:hidden">
          <summary>▼ 更多偏好（主题、预算、餐饮…）</summary>
          <div className="mobile-collapse-body space-y-4 pt-3">
            <PreferenceField label="旅行主题" name="style" options={STYLES} value={style} onChange={setStyle} columns={2} />
            <PreferenceField label="预算等级" name="budget" options={BUDGETS} value={budget} onChange={setBudget} columns={3} />
            <PreferenceField label="出行方式" name="transport" options={TRANSPORTS} value={transportPref} onChange={setTransportPref} columns={4} />
            <PreferenceField label="餐饮偏好" name="meal" options={MEALS} value={mealPref} onChange={setMealPref} columns={3} />
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">每餐最高人均</span>
              <input type="number" min={0} step={10} value={maxMealBudget} onChange={(e) => setMaxMealBudget(Number(e.target.value))} className={inputCls} placeholder="0=不限" />
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1">
              <input type="checkbox" checked={avoidCrowd} onChange={(e) => setAvoidCrowd(e.target.checked)} className="h-5 w-5 shrink-0 rounded border-warm-300 text-warm-500" />
              <span className="text-sm text-warm-text">避开高峰人流</span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">特殊需求</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="妆造、不吃辣…" />
            </label>
          </div>
        </details>

        {/* 桌面：全部展开 */}
        <div className="hidden space-y-5 sm:block">
          <PreferenceField label="旅行主题" name="style" options={STYLES} value={style} onChange={setStyle} columns={2} />
          <PreferenceField label="预算等级" name="budget" options={BUDGETS} value={budget} onChange={setBudget} columns={3} />
          <PreferenceField label="出行方式" name="transport" options={TRANSPORTS} value={transportPref} onChange={setTransportPref} columns={4} />
          <PreferenceField label="餐饮偏好" name="meal" options={MEALS} value={mealPref} onChange={setMealPref} columns={3} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">每餐最高人均（0=不限）</span>
            <input type="number" min={0} step={10} value={maxMealBudget} onChange={(e) => setMaxMealBudget(Number(e.target.value))} className={inputCls} />
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={avoidCrowd} onChange={(e) => setAvoidCrowd(e.target.checked)} className="h-4 w-4 rounded border-warm-300 text-warm-500" />
            <span className="text-sm text-warm-text">避开高峰人流</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-warm-muted">特殊需求（可选）</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </label>
        </div>
      </div>

      {/* 手机吸底提交 */}
      <div className="sticky bottom-0 border-t border-warm-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "生成中…" : "生成参考行程"}
        </button>
      </div>
    </form>
  );
}
