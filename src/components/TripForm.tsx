"use client";

import BudgetSummaryBar from "@/components/trip-form/BudgetSummaryBar";
import CityInput from "@/components/trip-form/CityInput";
import FormSection from "@/components/trip-form/FormSection";
import GenerateConfirmDialog from "@/components/trip-form/GenerateConfirmDialog";
import PreferenceField from "@/components/trip-form/PreferenceField";
import StrategyPresets from "@/components/trip-form/StrategyPresets";
import {
  computeFormSummary,
  loadTripFormState,
  saveTripFormState,
  type TripFormState,
} from "@/hooks/useTripFormState";
import {
  BUDGETS,
  DAY_STARTS,
  MEALS,
  PACES,
  PRIORITIES,
  SEAT_PREFS,
  STATION_MODES,
  STYLES,
  TRANSPORTS,
  DIETARY_OPTS,
} from "@/lib/trip-form-options";
import type { TripRequest } from "@/lib/types";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import { useCallback, useEffect, useMemo, useState } from "react";

interface TripFormProps {
  onSubmit: (request: TripRequest) => void;
  loading: boolean;
  onStateChange?: (state: TripFormState) => void;
}

const INPUT_CLS =
  "w-full min-w-0 rounded-xl border border-warm-200 bg-white px-4 py-3 text-warm-text outline-none transition focus:border-warm-500 focus:ring-2 focus:ring-warm-500/15 sm:py-2.5";

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
        className="stepper-btn"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="min-w-[3rem] text-center text-lg font-semibold text-warm-text">{value}</span>
      <button
        type="button"
        aria-label="增加人数"
        className="stepper-btn"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
      <span className="text-sm text-warm-muted">人</span>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-warm-300 text-warm-500"
      />
      <span>{label}</span>
    </label>
  );
}

export default function TripForm({ onSubmit, loading, onStateChange }: TripFormProps) {
  const today = new Date().toISOString().split("T")[0];
  const [state, setState] = useState<TripFormState>(() => loadTripFormState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const patch = useCallback((partial: Partial<TripFormState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    saveTripFormState(state);
    onStateChange?.(state);
  }, [state, onStateChange]);

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
      dayStart: state.dayStart,
      seatPref: state.seatPref,
      preferDirectTrain: state.preferDirectTrain,
      maxTicketPerPerson: state.maxTicketPerPerson,
      dietary: state.dietary.length > 0 ? state.dietary : undefined,
      maxHotelPerNight: state.maxHotelPerNight,
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
      <form onSubmit={handleSubmit} className="trip-form-card">
        <div className="trip-form-header">
          <div>
            <h2 className="text-base font-bold text-warm-text">行程参数</h2>
            <p className="mt-0.5 text-xs text-warm-muted">右侧可预查火车/门票，生成后支持拖拽改序</p>
          </div>
        </div>

        <div className="trip-form-body space-y-5">
          <BudgetSummaryBar state={state} />

          {fieldErrors.form && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldErrors.form}
            </p>
          )}

          <StrategyPresets
            activeId={state.activePreset}
            onApply={(presetPatch, presetId) => patch({ ...presetPatch, activePreset: presetId })}
          />

          <FormSection id="basics" title="行程基础" icon="📍" subtitle="出发地、日期与总预算">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                placeholder="北京、杭州、丽江、张家界"
                error={fieldErrors.city}
                inputClassName={INPUT_CLS}
              />
              <label className="block min-w-0">
                <span className="field-label">出发日期</span>
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
                <span className="field-label">玩几天</span>
                <input
                  type="number"
                  min={1}
                  max={14}
                  required
                  value={state.days}
                  onChange={(e) => patch({ days: Number(e.target.value) })}
                  className={INPUT_CLS}
                />
                {fieldErrors.days && <p className="mt-1 text-xs text-red-600">{fieldErrors.days}</p>}
              </label>
              <div className="block min-w-0">
                <span className="field-label">出行人数</span>
                <TravelersStepper value={state.travelers} onChange={(n) => patch({ travelers: n })} />
              </div>
              <label className="block min-w-0 sm:col-span-2">
                <span className="field-label">总预算（0 = 不限）</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={state.totalBudget}
                  onChange={(e) => patch({ totalBudget: Number(e.target.value) })}
                  className={INPUT_CLS}
                  placeholder={`参考 ${state.travelers * state.days * 400}（${state.travelers}人${state.days}天）`}
                />
              </label>
            </div>
          </FormSection>

          <FormSection id="strategy" title="规划策略" icon="🎯" subtitle="节奏与优化目标决定路线算法">
            <div className="space-y-4">
              <PreferenceField
                label="每日节奏"
                name="pace"
                options={PACES}
                value={state.pace}
                onChange={(v) => patch({ pace: v, activePreset: null })}
                columns={3}
              />
              <PreferenceField
                label="优化目标"
                name="priority"
                options={PRIORITIES}
                value={state.priority}
                onChange={(v) => patch({ priority: v, activePreset: null })}
                columns={3}
              />
            </div>
          </FormSection>

          <FormSection
            id="theme"
            title="主题与消费"
            icon="🍜"
            subtitle="景点类型、住宿与餐饮预算"
            collapsible
            defaultOpen
          >
            <div className="space-y-4">
              <PreferenceField
                label="旅行主题"
                name="style"
                options={STYLES}
                value={state.style}
                onChange={(v) => patch({ style: v, activePreset: null })}
                columns={2}
              />
              <PreferenceField
                label="住宿等级"
                hint={budgetLocked ? "总预算已锁定" : "不填总预算时生效"}
                name="budget"
                options={BUDGETS}
                value={state.budget}
                onChange={(v) => patch({ budget: v })}
                columns={3}
                disabled={budgetLocked}
              />
              <PreferenceField
                label="餐饮偏好"
                name="meal"
                options={MEALS}
                value={state.mealPref}
                onChange={(v) => patch({ mealPref: v })}
                columns={3}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className="field-label">每餐最高人均（0=不限）</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={state.maxMealBudget}
                    onChange={(e) => patch({ maxMealBudget: Number(e.target.value) })}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="field-label">每晚住宿上限（0=自动）</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={state.maxHotelPerNight}
                    onChange={(e) => patch({ maxHotelPerNight: Number(e.target.value) })}
                    className={INPUT_CLS}
                    placeholder="如 120，省钱模式推荐"
                  />
                </label>
                <label className="block min-w-0 sm:col-span-2">
                  <span className="field-label">门票上限（元/人，0=不限）</span>
                  <input
                    type="number"
                    min={0}
                    step={20}
                    value={state.maxTicketPerPerson}
                    onChange={(e) => patch({ maxTicketPerPerson: Number(e.target.value) })}
                    className={INPUT_CLS}
                    placeholder="如 150，过滤高价景区"
                  />
                </label>
              </div>
              <div>
                <span className="field-label">饮食约束（可多选）</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DIETARY_OPTS.map((opt) => {
                    const active = state.dietary.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          patch({
                            dietary: active
                              ? state.dietary.filter((d) => d !== opt.value)
                              : [...state.dietary, opt.value],
                          })
                        }
                        className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                          active
                            ? "border-warm-500 bg-warm-500 text-white"
                            : "border-warm-200 bg-white text-warm-text"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection
            id="transport"
            title="交通与约束"
            icon="🚄"
            subtitle="市内出行、火车查票与步行上限"
            collapsible
            defaultOpen
          >
            <div className="space-y-4">
              <PreferenceField
                label="市内出行"
                name="transport"
                options={TRANSPORTS}
                value={state.transportPref}
                onChange={(v) => patch({ transportPref: v })}
                columns={4}
              />
              <PreferenceField
                label="出发火车站"
                hint="查票时同城多站排序"
                name="station"
                options={STATION_MODES}
                value={state.departureStationMode}
                onChange={(v) => patch({ departureStationMode: v })}
                columns={3}
              />
              <PreferenceField
                label="座位偏好"
                name="seat"
                options={SEAT_PREFS}
                value={state.seatPref}
                onChange={(v) => patch({ seatPref: v })}
                columns={3}
              />
              <PreferenceField
                label="每日出门"
                name="dayStart"
                options={DAY_STARTS}
                value={state.dayStart}
                onChange={(v) => patch({ dayStart: v })}
                columns={3}
              />
              <label className="block min-w-0">
                <span className="field-label">每日最大步行 km</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={state.maxWalkKmPerDay}
                  onChange={(e) => patch({ maxWalkKmPerDay: Number(e.target.value) })}
                  className={INPUT_CLS}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <ToggleRow checked={state.avoidCrowd} onChange={(v) => patch({ avoidCrowd: v })} label="避开高峰人流" />
                <ToggleRow
                  checked={state.preferDirectTrain}
                  onChange={(v) => patch({ preferDirectTrain: v })}
                  label="火车优先直达"
                />
                <ToggleRow checked={state.withChildren} onChange={(v) => patch({ withChildren: v })} label="带娃" />
                <ToggleRow checked={state.withElderly} onChange={(v) => patch({ withElderly: v })} label="有老人" />
                <ToggleRow checked={state.accessibility} onChange={(v) => patch({ accessibility: v })} label="无障碍" />
              </div>
            </div>
          </FormSection>

          <FormSection
            id="advanced"
            title="必去与避开"
            icon="✏️"
            subtitle="景点白名单/黑名单与备注"
            collapsible
            defaultOpen={false}
          >
            <div className="space-y-3">
              <label className="block min-w-0">
                <span className="field-label">必去景点（逗号分隔，右侧自动查门票）</span>
                <input
                  value={state.mustVisitText}
                  onChange={(e) => patch({ mustVisitText: e.target.value })}
                  className={INPUT_CLS}
                  placeholder="故宫、西湖、天门山"
                />
              </label>
              <label className="block min-w-0">
                <span className="field-label">不去/避开</span>
                <input
                  value={state.excludeText}
                  onChange={(e) => patch({ excludeText: e.target.value })}
                  className={INPUT_CLS}
                  placeholder="人多的商业街"
                />
              </label>
              <label className="block min-w-0">
                <span className="field-label">特殊需求</span>
                <textarea
                  value={state.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  rows={2}
                  className={INPUT_CLS}
                  placeholder="妆造、不吃辣…"
                />
              </label>
            </div>
          </FormSection>
        </div>

        <div className="trip-form-footer">
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
