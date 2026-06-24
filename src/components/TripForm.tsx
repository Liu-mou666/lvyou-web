"use client";

import BudgetSummaryBar from "@/components/trip-form/BudgetSummaryBar";
import CityInput from "@/components/trip-form/CityInput";
import GenerateConfirmDialog from "@/components/trip-form/GenerateConfirmDialog";
import PreferenceField from "@/components/trip-form/PreferenceField";
import {
  computeFormSummary,
  loadTripFormState,
  saveTripFormState,
  type TripFormState,
} from "@/hooks/useTripFormState";
import {
  BUDGETS,
  MEALS,
  PACES,
  PRIORITIES,
  STATION_MODES,
  STYLES,
  TRANSPORTS,
} from "@/lib/trip-form-options";
import type { TripRequest } from "@/lib/types";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import { useCallback, useEffect, useMemo, useState } from "react";

interface TripFormProps {
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
}

const INPUT_CLS =
  "w-full min-w-0 rounded-xl border border-warm-200 bg-white px-4 py-3.5 text-warm-text outline-none transition focus:border-warm-500 focus:ring-2 focus:ring-warm-500/15 sm:py-2.5";

function TravelersStepper({
  value,
  onChange,
  min = 1,
  max = 8,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="减少人数"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warm-200 bg-white text-lg font-medium text-warm-text active:scale-95 disabled:opacity-40"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="min-w-[3rem] text-center text-lg font-semibold text-warm-text">{value}</span>
      <button
        type="button"
        aria-label="增加人数"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warm-200 bg-white text-lg font-medium text-warm-text active:scale-95 disabled:opacity-40"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
      <span className="text-sm text-warm-muted">人</span>
    </div>
  );
}

export default function TripForm({ onSubmit, loading }: TripFormProps) {
  const today = new Date().toISOString().split("T")[0];
  const [state, setState] = useState<TripFormState>(() => loadTripFormState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const patch = useCallback((partial: Partial<TripFormState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    saveTripFormState(state);
  }, [state]);

  const summary = useMemo(() => computeFormSummary(state), [state]);
  const budgetLocked = summary.budgetLocked;

  function buildPayload() {
    return {
      city: state.city.trim(),
      departureCity: state.departureCity.trim(),
      days: state.days,
      style: state.style,
      pace: state.pace,
      budget: state.budget,
      startDate: state.startDate,
      travelers: state.travelers,
      priority: state.priority,
      transportPref: state.transportPref,
      mealPref: state.mealPref,
      avoidCrowd: state.avoidCrowd,
      maxMealBudget: state.maxMealBudget,
      totalBudget: state.totalBudget,
      notes: state.notes.trim() || undefined,
      departureStationMode: state.departureStationMode,
      mustVisit: state.mustVisitText
        .split(/[,，、/|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      exclude: state.excludeText
        .split(/[,，、/|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      maxWalkKmPerDay: state.maxWalkKmPerDay,
      withChildren: state.withChildren,
      withElderly: state.withElderly,
      accessibility: state.accessibility,
    };
  }

  function trySubmit() {
    const parsed = tripRequestSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return null;
    }
    setFieldErrors({});
    return buildTripRequest(parsed.data);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trip = trySubmit();
    if (!trip) return;

    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) {
      setConfirmOpen(true);
      return;
    }
    onSubmit(trip);
  }

  function handleConfirmGenerate() {
    const trip = trySubmit();
    if (!trip) {
      setConfirmOpen(false);
      return;
    }
    onSubmit(trip);
    setConfirmOpen(false);
  }

  const confirmSummary = `${state.departureCity} → ${state.city} · ${state.days}天${state.travelers}人 · ${summary.endDate}结束 · 预算${summary.inferred}`;

  return (
    <>
      <form onSubmit={handleSubmit} className="card-warm overflow-hidden p-0 sm:p-5">
        <div className="border-b border-warm-200 bg-warm-100/60 px-4 py-3 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0">
          <h2 className="text-base font-semibold text-warm-text">行程参数</h2>
          <p className="mt-0.5 text-xs text-warm-muted">填写后生成参考行程，右侧可查看地图、榜单与预算</p>
        </div>

        <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-0">
          <BudgetSummaryBar state={state} />

          {fieldErrors.form && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fieldErrors.form}</p>
          )}

          {/* ① 基础信息 */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-warm-muted sm:text-sm">
              ① 行程基础
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <CityInput
                label="从哪出发"
                value={state.departureCity}
                onChange={(v) => patch({ departureCity: v })}
                placeholder="上海、张家界"
                inputClassName={INPUT_CLS}
              />
              <CityInput
                label="去哪玩"
                value={state.city}
                onChange={(v) => patch({ city: v })}
                placeholder="苏州、丽江"
                error={fieldErrors.city}
                inputClassName={INPUT_CLS}
              />
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-warm-muted">出发日期</span>
                <input
                  type="date"
                  required
                  min={today}
                  value={state.startDate}
                  onChange={(e) => patch({ startDate: e.target.value })}
                  className={INPUT_CLS}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-warm-muted">玩几天</span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  required
                  value={state.days}
                  onChange={(e) => patch({ days: Number(e.target.value) })}
                  className={INPUT_CLS}
                />
                {fieldErrors.days && <p className="mt-1 text-xs text-red-600">{fieldErrors.days}</p>}
              </label>
              <div className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-warm-muted">出行人数</span>
                <TravelersStepper value={state.travelers} onChange={(n) => patch({ travelers: n })} />
                {fieldErrors.travelers && <p className="mt-1 text-xs text-red-600">{fieldErrors.travelers}</p>}
              </div>
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-warm-muted">总预算（0 = 不限，填了将自动推导预算等级）</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={state.totalBudget}
                  onChange={(e) => patch({ totalBudget: Number(e.target.value) })}
                  className={INPUT_CLS}
                  placeholder={`如 ${state.travelers * state.days * 400}（${state.travelers}人${state.days}天参考）`}
                />
              </label>
            </div>
          </section>

          {/* ② 常用偏好 — 手机直接展示 */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-warm-muted sm:text-sm">② 偏好与节奏</h3>
            <PreferenceField label="行程节奏" name="pace" options={PACES} value={state.pace} onChange={(v) => patch({ pace: v })} columns={3} />
            <PreferenceField label="优化目标" name="priority" options={PRIORITIES} value={state.priority} onChange={(v) => patch({ priority: v })} columns={3} />
            <PreferenceField
              label="出发火车站"
              hint="查票时同城多站排序"
              name="station"
              options={STATION_MODES}
              value={state.departureStationMode}
              onChange={(v) => patch({ departureStationMode: v })}
              columns={3}
            />
          </section>

          {/* 手机：更多折叠 */}
          <details className="mobile-collapse sm:hidden">
            <summary>▼ 更多偏好（主题、预算、餐饮…）</summary>
            <div className="mobile-collapse-body space-y-4 pt-3">
              <PreferenceField label="旅行主题" name="style-m" options={STYLES} value={state.style} onChange={(v) => patch({ style: v })} columns={2} />
              <PreferenceField
                label="预算等级"
                hint={budgetLocked ? "已锁定" : undefined}
                name="budget-m"
                options={BUDGETS}
                value={state.budget}
                onChange={(v) => patch({ budget: v })}
                columns={3}
                disabled={budgetLocked}
              />
              <PreferenceField label="出行方式" name="transport-m" options={TRANSPORTS} value={state.transportPref} onChange={(v) => patch({ transportPref: v })} columns={4} />
              <PreferenceField label="餐饮偏好" name="meal-m" options={MEALS} value={state.mealPref} onChange={(v) => patch({ mealPref: v })} columns={3} />
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-warm-muted">每餐最高人均</span>
                <input type="number" min={0} step={10} value={state.maxMealBudget} onChange={(e) => patch({ maxMealBudget: Number(e.target.value) })} className={INPUT_CLS} placeholder="0=不限" />
              </label>
              <label className="flex cursor-pointer items-center gap-3 py-1">
                <input type="checkbox" checked={state.avoidCrowd} onChange={(e) => patch({ avoidCrowd: e.target.checked })} className="h-5 w-5 shrink-0 rounded border-warm-300 text-warm-500" />
                <span className="text-sm text-warm-text">避开高峰人流</span>
              </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">必去景点（逗号分隔）</span>
              <input value={state.mustVisitText} onChange={(e) => patch({ mustVisitText: e.target.value })} className={INPUT_CLS} placeholder="故宫、西湖" />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">不去/避开（逗号分隔）</span>
              <input value={state.excludeText} onChange={(e) => patch({ excludeText: e.target.value })} className={INPUT_CLS} placeholder="人多的商业街" />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">每日最大步行 km</span>
              <input type="number" min={1} max={20} value={state.maxWalkKmPerDay} onChange={(e) => patch({ maxWalkKmPerDay: Number(e.target.value) })} className={INPUT_CLS} />
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1">
              <input type="checkbox" checked={state.withChildren} onChange={(e) => patch({ withChildren: e.target.checked })} className="h-5 w-5 rounded border-warm-300 text-warm-500" />
              <span className="text-sm text-warm-text">带娃（自动放缓节奏）</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1">
              <input type="checkbox" checked={state.withElderly} onChange={(e) => patch({ withElderly: e.target.checked })} className="h-5 w-5 rounded border-warm-300 text-warm-500" />
              <span className="text-sm text-warm-text">有老人/长辈同行</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1">
              <input type="checkbox" checked={state.accessibility} onChange={(e) => patch({ accessibility: e.target.checked })} className="h-5 w-5 rounded border-warm-300 text-warm-500" />
              <span className="text-sm text-warm-text">无障碍需求</span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">特殊需求</span>
              <textarea value={state.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={INPUT_CLS} placeholder="妆造、不吃辣、必去「天门山」…" />
            </label>
            </div>
          </details>

          {/* 桌面：③ 详细偏好 */}
          <section className="hidden space-y-5 sm:block">
            <h3 className="text-sm font-semibold text-warm-muted">③ 详细偏好</h3>
            <PreferenceField label="旅行主题" name="style" options={STYLES} value={state.style} onChange={(v) => patch({ style: v })} columns={2} />
            <PreferenceField
              label="预算等级"
              hint={budgetLocked ? "总预算已填，等级自动推导" : "不填总预算时生效"}
              name="budget"
              options={BUDGETS}
              value={state.budget}
              onChange={(v) => patch({ budget: v })}
              columns={3}
              disabled={budgetLocked}
            />
            <PreferenceField label="出行方式" name="transport" options={TRANSPORTS} value={state.transportPref} onChange={(v) => patch({ transportPref: v })} columns={4} />
            <PreferenceField label="餐饮偏好" name="meal" options={MEALS} value={state.mealPref} onChange={(v) => patch({ mealPref: v })} columns={3} />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">每餐最高人均（0=不限）</span>
              <input type="number" min={0} step={10} value={state.maxMealBudget} onChange={(e) => patch({ maxMealBudget: Number(e.target.value) })} className={INPUT_CLS} />
            </label>
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={state.avoidCrowd} onChange={(e) => patch({ avoidCrowd: e.target.checked })} className="h-4 w-4 rounded border-warm-300 text-warm-500" />
              <span className="text-sm text-warm-text">避开高峰人流</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">必去景点（逗号分隔）</span>
              <input value={state.mustVisitText} onChange={(e) => patch({ mustVisitText: e.target.value })} className={INPUT_CLS} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">不去/避开</span>
              <input value={state.excludeText} onChange={(e) => patch({ excludeText: e.target.value })} className={INPUT_CLS} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">每日最大步行 km</span>
              <input type="number" min={1} max={20} value={state.maxWalkKmPerDay} onChange={(e) => patch({ maxWalkKmPerDay: Number(e.target.value) })} className={INPUT_CLS} />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={state.withChildren} onChange={(e) => patch({ withChildren: e.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm">带娃</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={state.withElderly} onChange={(e) => patch({ withElderly: e.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm">有老人</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={state.accessibility} onChange={(e) => patch({ accessibility: e.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm">无障碍</span>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-warm-muted">特殊需求（可选）</span>
              <textarea value={state.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={INPUT_CLS} placeholder="妆造、不吃辣、必去「天门山」…" />
            </label>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-warm-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "生成中…" : "生成参考行程"}
          </button>
        </div>
      </form>

      <GenerateConfirmDialog
        open={confirmOpen}
        summary={confirmSummary}
        warnings={summary.warnings}
        loading={loading}
        onConfirm={handleConfirmGenerate}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
