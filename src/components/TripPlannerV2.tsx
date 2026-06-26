"use client";

import BudgetSummary from "@/components/BudgetSummary";
import GenerateProgress from "@/components/GenerateProgress";
import ItineraryHistoryPanel from "@/components/ItineraryHistoryPanel";
import ItineraryView from "@/components/ItineraryView";
import PriceAuditPanel from "@/components/PriceAuditPanel";
import TransportCompare from "@/components/TransportCompare";
import TripForm from "@/components/TripForm";
import VariantCompare from "@/components/VariantCompare";
import PreTripPricePanel from "@/components/trip-form/PreTripPricePanel";
import AppFooter from "@/components/v2/AppFooter";
import BudgetTrafficLight from "@/components/v2/BudgetTrafficLight";
import DayTimeline from "@/components/v2/DayTimeline";
import HistoryDiffPanel from "@/components/v2/HistoryDiffPanel";
import MapDrawer from "@/components/v2/MapDrawer";
import WizardStepper, { type WizardStep } from "@/components/v2/WizardStepper";
import { useGenerateStream } from "@/hooks/useGenerateStream";
import {
  DEFAULT_TRIP_FORM_STATE,
  formStateToTripRequest,
  type TripFormState,
} from "@/hooks/useTripFormState";
import { useItineraryHistory, type SavedTrip } from "@/hooks/useItineraryHistory";
import type { DayPlan, Itinerary, PlanObjective, TripRequest } from "@/lib/types";
import type { PricePreviewResult } from "@/lib/apis/preview-prices";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

type ExecuteView = "timeline" | "detail" | "budget" | "compare";

async function fetchPreviewForDecide(state: TripFormState): Promise<PricePreviewResult | null> {
  if (!state.departureCity.trim() || !state.city.trim()) return null;
  const res = await fetch("/api/preview-prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      departureCity: state.departureCity.trim(),
      city: state.city.trim(),
      startDate: state.startDate,
      travelers: state.travelers,
      priority: state.priority,
      totalBudget: state.totalBudget,
      departureStationMode: state.departureStationMode,
      mustVisit: state.mustVisitText.split(/[,，、/|]/).map((s) => s.trim()).filter(Boolean),
      preferDirectTrain: state.preferDirectTrain,
      seatPref: state.seatPref,
      maxHotelPerNight: state.maxHotelPerNight,
    }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<PricePreviewResult>;
}

export default function TripPlannerV2() {
  const { generate, cancel, loading, progress, itinerary, error, setItinerary, setError } = useGenerateStream();
  const { history, save, remove, exportJson } = useItineraryHistory();
  const [wizardStep, setWizardStep] = useState<WizardStep>("intent");
  const [executeView, setExecuteView] = useState<ExecuteView>("timeline");
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<PlanObjective>("value");
  const [formState, setFormState] = useState<TripFormState>(DEFAULT_TRIP_FORM_STATE);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [diffPair, setDiffPair] = useState<{ current: SavedTrip; baseline: SavedTrip } | null>(null);
  const [refreshingDay, setRefreshingDay] = useState<number | null>(null);
  const [reorderingDay, setReorderingDay] = useState<number | null>(null);
  const savedRef = useRef<string | null>(null);

  const { data: decidePreview, isFetching: decidePreviewLoading } = useQuery({
    queryKey: ["decide-preview", formState.departureCity, formState.city, formState.startDate],
    queryFn: () => fetchPreviewForDecide(formState),
    enabled: wizardStep === "decide",
    staleTime: 30_000,
  });

  useEffect(() => {
    if (itinerary?.selectedVariant) setSelectedVariant(itinerary.selectedVariant);
  }, [itinerary?.selectedVariant]);

  useEffect(() => {
    if (itinerary?.days.length && !loading) {
      setWizardStep("execute");
    }
  }, [itinerary?.days.length, loading]);

  useEffect(() => {
    if (!itinerary || loading || !lastRequest || progress?.step !== "done") return;
    const key = itinerary.generatedAt;
    if (savedRef.current === key) return;
    savedRef.current = key;
    save(lastRequest, itinerary);
  }, [itinerary, loading, lastRequest, progress?.step, save]);

  const refreshDayMutation = useMutation({
    mutationFn: async (dayIndex: number) => {
      if (!lastRequest) throw new Error("无可刷新行程");
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lastRequest, dayIndex, existingDay: itinerary?.days[dayIndex] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "刷新失败");
      return { dayIndex, dayPlan: data.dayPlan as DayPlan, refreshedAt: data.refreshedAt as string };
    },
    onMutate: (dayIndex) => setRefreshingDay(dayIndex),
    onSuccess: (data) => {
      if (!itinerary) return;
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) => (i === data.dayIndex ? data.dayPlan : d)),
        generatedAt: data.refreshedAt,
      });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "刷新失败"),
    onSettled: () => setRefreshingDay(null),
  });

  const reoptimizeMutation = useMutation({
    mutationFn: async ({ dayIndex, attractionIds }: { dayIndex: number; attractionIds: string[] }) => {
      if (!lastRequest || !itinerary) throw new Error("无可重算行程");
      const res = await fetch("/api/reoptimize-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lastRequest,
          dayIndex,
          attractionIds,
          templateDay: itinerary.days[dayIndex],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "重算失败");
      return { dayIndex, dayPlan: data.dayPlan as DayPlan };
    },
    onMutate: ({ dayIndex }) => setReorderingDay(dayIndex),
    onSuccess: (data) => {
      if (!itinerary) return;
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) => (i === data.dayIndex ? data.dayPlan : d)),
      });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "重算失败"),
    onSettled: () => setReorderingDay(null),
  });

  function goToDecide() {
    const { trip, errors } = formStateToTripRequest(formState);
    if (!trip) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setWizardStep("decide");
  }

  async function handleGenerate() {
    const { trip, errors } = formStateToTripRequest(formState);
    if (!trip) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setLastRequest(trip);
    savedRef.current = null;
    setWizardStep("execute");
    await generate(trip);
  }

  function handleSelectVariant(objective: PlanObjective) {
    if (!itinerary?.variants) return;
    const v = itinerary.variants.find((x) => x.objective === objective);
    if (!v) return;
    setSelectedVariant(objective);
    setItinerary({ ...v.itinerary, variants: itinerary.variants, selectedVariant: objective });
  }

  function handleLoadHistory(item: SavedTrip) {
    setLastRequest(item.request);
    setItinerary(item.itinerary);
    setSelectedVariant(item.itinerary.selectedVariant ?? "value");
    setWizardStep("execute");
    setExecuteView("timeline");
  }

  function handleCompareHistory(item: SavedTrip) {
    if (!itinerary || !lastRequest) return;
    setDiffPair({
      current: {
        id: "current",
        city: itinerary.city,
        days: itinerary.days.length,
        totalCost: itinerary.totalCost,
        request: lastRequest,
        itinerary,
        savedAt: new Date().toISOString(),
      },
      baseline: item,
    });
  }

  function resetPlanner() {
    setItinerary(null);
    setLastRequest(null);
    setWizardStep("intent");
    setExecuteView("timeline");
    setDiffPair(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-warm-50 via-[#fffbf7] to-warm-100 safe-bottom">
      <header
        className="sticky top-0 z-30 border-b border-warm-200 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="v2-hero-title truncate">
                <span className="text-warm-500">旅优 2.0</span>
                {itinerary ? (
                  <span className="text-warm-muted"> · {itinerary.city}</span>
                ) : (
                  <span className="text-warm-muted"> · 全国智能规划</span>
                )}
              </h1>
              <div className="v2-tag-row">
                {["PriceTruth", "三屏向导", "12306", "全国"].map((tag) => (
                  <span key={tag} className="v2-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {itinerary && !loading && (
                <>
                  <button
                    type="button"
                    onClick={() => setMapOpen(true)}
                    className="rounded-lg border border-warm-300 px-2.5 py-1.5 text-xs font-medium text-warm-700"
                  >
                    地图
                  </button>
                  <button
                    type="button"
                    onClick={() => exportJson(itinerary, lastRequest ?? undefined)}
                    className="rounded-lg border border-warm-300 px-2.5 py-1.5 text-xs font-medium text-warm-700"
                  >
                    导出
                  </button>
                  <button
                    type="button"
                    onClick={resetPlanner}
                    className="rounded-lg bg-warm-100 px-2.5 py-1.5 text-xs font-medium text-warm-700"
                  >
                    新规划
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="mt-2">
            <WizardStepper
              active={wizardStep}
              maxReachable={itinerary ? "execute" : wizardStep}
              onChange={(s) => {
                if (s === "execute" && !itinerary) return;
                setWizardStep(s);
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-6">
        {wizardStep === "intent" && (
          <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
            <div className="lg:col-span-6 space-y-4">
              <div className="card-warm p-4">
                <p className="text-sm font-semibold text-warm-text">第 1 步 · 旅行意图</p>
                <p className="mt-1 text-xs text-warm-muted">出发地、目的地、天数与偏好 — 填好后进入决策预览</p>
              </div>
              <TripForm onSubmit={handleGenerate} loading={loading} onStateChange={setFormState} hideSubmit />
              {Object.keys(formErrors).length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {Object.values(formErrors)[0]}
                </div>
              )}
              <button type="button" onClick={goToDecide} className="btn-primary">
                下一步：查价决策 →
              </button>
            </div>
            <div className="lg:col-span-6 space-y-4">
              <ItineraryHistoryPanel
                items={history}
                onLoad={handleLoadHistory}
                onRemove={remove}
                onExport={(item) => exportJson(item.itinerary, item.request)}
              />
              <div className="card-warm border-dashed p-6 text-center">
                <p className="font-semibold text-warm-text">2.0 三屏向导</p>
                <ol className="mx-auto mt-3 max-w-sm space-y-2 text-left text-xs text-warm-muted">
                  <li>1. 意图 — 填写行程需求与约束</li>
                  <li>2. 决策 — 火车票价 + 预算红绿灯</li>
                  <li>3. 行程 — 时间轴、地图、三套方案</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {wizardStep === "decide" && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="card-warm p-4">
              <p className="text-sm font-semibold text-warm-text">第 2 步 · 决策预览</p>
              <p className="mt-1 text-xs text-warm-muted">
                {formState.departureCity} → {formState.city} · {formState.days}天 · {formState.travelers}人
              </p>
            </div>
            <PreTripPricePanel state={formState} />
            <BudgetTrafficLight state={formState} preview={decidePreview} loading={decidePreviewLoading} />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setWizardStep("intent")}
                className="flex-1 rounded-xl border border-warm-300 py-3 text-sm font-medium text-warm-700"
              >
                ← 返回修改
              </button>
              <button type="button" onClick={handleGenerate} disabled={loading} className="btn-primary flex-[2]">
                {loading ? "生成中…" : "确认并生成行程"}
              </button>
            </div>
          </div>
        )}

        {wizardStep === "execute" && (
          <div className="space-y-4">
            {loading && progress && <GenerateProgress progress={progress} onCancel={cancel} />}
            {error && (
              <div className="card-warm border-red-200 bg-red-50/80 p-4 text-red-700">
                <p className="font-medium">生成失败</p>
                <p className="mt-1 text-sm break-anywhere">{error}</p>
              </div>
            )}

            {itinerary && (
              <>
                <div className="execute-subtabs" role="tablist">
                  {(
                    [
                      ["timeline", "时间轴"],
                      ["detail", "完整行程"],
                      ["budget", "预算"],
                      ["compare", "方案对比"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={executeView === id}
                      onClick={() => setExecuteView(id)}
                      className={`execute-subtab ${executeView === id ? "active" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {executeView === "timeline" && (
                  <DayTimeline
                    itinerary={itinerary}
                    onRefreshDay={(i) => refreshDayMutation.mutate(i)}
                    refreshingDay={refreshingDay}
                    onReorderDay={async (dayIndex, ids) => {
                      await reoptimizeMutation.mutateAsync({ dayIndex, attractionIds: ids });
                    }}
                    reorderingDay={reorderingDay}
                    travelers={lastRequest?.travelers ?? 2}
                  />
                )}

                {executeView === "detail" && (
                  <ItineraryView
                    itinerary={itinerary}
                    mode="compact"
                    onRefreshDay={(i) => refreshDayMutation.mutate(i)}
                    refreshingDay={refreshingDay}
                    onReorderDay={async (dayIndex, ids) => {
                      await reoptimizeMutation.mutateAsync({ dayIndex, attractionIds: ids });
                    }}
                    reorderingDay={reorderingDay}
                    travelers={lastRequest?.travelers ?? 2}
                  />
                )}

                {executeView === "budget" && (
                  <div className="space-y-4">
                    {itinerary.priceAudit && <PriceAuditPanel audit={itinerary.priceAudit} />}
                    {itinerary.budgetBreakdown && <BudgetSummary breakdown={itinerary.budgetBreakdown} />}
                    <TransportCompare
                      trainRoutes={itinerary.trainRoutes}
                      flightOption={itinerary.flightOption}
                      busOption={itinerary.busOption}
                      recommended={itinerary.recommendedTransport}
                      routeDistanceKm={itinerary.routeDistanceKm}
                      transportEvidence={itinerary.transportEvidence}
                      travelers={lastRequest?.travelers ?? 2}
                    />
                  </div>
                )}

                {executeView === "compare" && itinerary.variants && (
                  <VariantCompare
                    itinerary={itinerary}
                    selected={selectedVariant}
                    onSelect={handleSelectVariant}
                  />
                )}

                <ItineraryHistoryPanel
                  items={history}
                  onLoad={handleLoadHistory}
                  onRemove={remove}
                  onExport={(item) => exportJson(item.itinerary, item.request)}
                  onCompare={handleCompareHistory}
                />

                {diffPair && (
                  <HistoryDiffPanel
                    current={diffPair.current}
                    baseline={diffPair.baseline}
                    onClose={() => setDiffPair(null)}
                  />
                )}
              </>
            )}

            {!itinerary && !loading && !error && (
              <div className="card-warm p-8 text-center text-warm-muted">
                <p>请从「决策」步骤确认生成，或从历史记录加载行程</p>
                <button
                  type="button"
                  onClick={() => setWizardStep("decide")}
                  className="mt-4 rounded-lg bg-warm-500 px-4 py-2 text-sm font-medium text-white"
                >
                  前往决策
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <MapDrawer open={mapOpen} onClose={() => setMapOpen(false)} itinerary={itinerary} />
      <AppFooter />
    </div>
  );
}
