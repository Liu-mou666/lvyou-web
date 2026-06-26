"use client";

import AppTabs, { type AppTab } from "@/components/AppTabs";
import BudgetSummary from "@/components/BudgetSummary";
import DestinationRankList from "@/components/DestinationRankList";
import GenerateProgress from "@/components/GenerateProgress";
import ItineraryHistoryPanel from "@/components/ItineraryHistoryPanel";
import ItineraryView from "@/components/ItineraryView";
import MapView from "@/components/MapView";
import TransportCompare from "@/components/TransportCompare";
import TripForm from "@/components/TripForm";
import PreTripPricePanel from "@/components/trip-form/PreTripPricePanel";
import PriceAuditPanel from "@/components/PriceAuditPanel";
import VariantCompare from "@/components/VariantCompare";
import { useGenerateStream } from "@/hooks/useGenerateStream";
import { DEFAULT_TRIP_FORM_STATE, type TripFormState } from "@/hooks/useTripFormState";
import { useItineraryHistory, type SavedTrip } from "@/hooks/useItineraryHistory";
import type { DayPlan, Itinerary, PlanObjective, TripRequest } from "@/lib/types";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

function tabDisabled(itinerary: Itinerary | null, loading: boolean): Partial<Record<AppTab, boolean>> {
  if (!itinerary) {
    return { map: true, itinerary: true, rank: true, budget: true, compare: true };
  }
  const hasVisitCoords = itinerary.days.some((d) =>
    d.items.some((i) => i.kind === "visit" && i.poi?.lat && i.poi?.lng),
  );
  const hasDays = itinerary.days.length > 0;
  const hasRank = (itinerary.topAttractions?.length ?? 0) > 0;
  const hasBudget =
    itinerary.budgetBreakdown != null ||
    (itinerary.trainRoutes?.length ?? 0) > 0 ||
    itinerary.flightOption != null;
  const hasVariants = (itinerary.variants?.length ?? 0) > 0;
  return {
    map: !hasVisitCoords && !loading,
    itinerary: !hasDays,
    rank: !hasRank && !loading,
    budget: !hasBudget && !loading,
    compare: !hasVariants && !loading,
  };
}

export default function TripPlanner() {
  const { generate, cancel, loading, progress, itinerary, error, setItinerary, setError } = useGenerateStream();
  const { history, save, remove, exportJson } = useItineraryHistory();
  const [activeTab, setActiveTab] = useState<AppTab>("plan");
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<PlanObjective>("value");
  const [formState, setFormState] = useState<TripFormState>(DEFAULT_TRIP_FORM_STATE);
  const [refreshingDay, setRefreshingDay] = useState<number | null>(null);
  const [reorderingDay, setReorderingDay] = useState<number | null>(null);
  const savedRef = useRef<string | null>(null);

  const disabledTabs = useMemo(() => tabDisabled(itinerary, loading), [itinerary, loading]);

  useEffect(() => {
    if (itinerary?.selectedVariant) {
      setSelectedVariant(itinerary.selectedVariant);
    }
  }, [itinerary?.selectedVariant]);

  useEffect(() => {
    if (itinerary?.days.length && !loading) {
      setActiveTab((prev) => (prev === "plan" ? "itinerary" : prev));
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
        body: JSON.stringify({
          ...lastRequest,
          dayIndex,
          existingDay: itinerary?.days[dayIndex],
        }),
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
      const templateDay = itinerary.days[dayIndex];
      const res = await fetch("/api/reoptimize-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lastRequest,
          dayIndex,
          attractionIds,
          templateDay,
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

  async function handleGenerate(request: TripRequest) {
    setLastRequest(request);
    savedRef.current = null;
    setActiveTab("plan");
    await generate(request);
  }

  function handleSelectVariant(objective: PlanObjective) {
    if (!itinerary?.variants) return;
    const v = itinerary.variants.find((x) => x.objective === objective);
    if (!v) return;
    setSelectedVariant(objective);
    setItinerary({
      ...v.itinerary,
      variants: itinerary.variants,
      selectedVariant: objective,
    });
  }

  function handleLoadHistory(item: SavedTrip) {
    setLastRequest(item.request);
    setItinerary(item.itinerary);
    setSelectedVariant(item.itinerary.selectedVariant ?? "value");
    setActiveTab("itinerary");
  }

  const showMobileNav = activeTab !== "plan" || itinerary != null;

  return (
    <div
      className={`min-h-screen bg-gradient-to-b from-warm-50 via-[#fffbf7] to-warm-100 ${
        showMobileNav ? "has-mobile-nav sm:safe-bottom" : "safe-bottom"
      }`}
    >
      <header
        className="sticky top-0 z-30 border-b border-warm-200 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-bold text-warm-text sm:text-lg">
                <span className="text-warm-500">旅优</span>
                {itinerary ? (
                  <span className="text-warm-muted"> · {itinerary.city}</span>
                ) : (
                  <span className="text-warm-muted"> · 全国智能规划</span>
                )}
              </h1>
              {!itinerary && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {["任意城市", "12306火车", "深链实价", "拖拽改序"].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-medium text-warm-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {itinerary && !loading && (
              <button
                type="button"
                onClick={() => exportJson(itinerary, lastRequest ?? undefined)}
                className="shrink-0 rounded-lg border border-warm-300 px-3 py-1.5 text-xs font-medium text-warm-700"
              >
                导出 JSON
              </button>
            )}
          </div>
          <AppTabs
            variant="desktop"
            active={activeTab}
            onChange={setActiveTab}
            disabled={disabledTabs}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-6">
        {activeTab === "plan" && (
          <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
            <div className="lg:col-span-5 lg:sticky lg:top-[7.5rem] lg:self-start space-y-4">
              <TripForm onSubmit={handleGenerate} loading={loading} onStateChange={setFormState} />
              <ItineraryHistoryPanel
                items={history}
                onLoad={handleLoadHistory}
                onRemove={remove}
                onExport={(item) => exportJson(item.itinerary, item.request)}
              />
            </div>
            <div className="space-y-4 lg:col-span-7">
              <PreTripPricePanel state={formState} />
              {loading && progress && <GenerateProgress progress={progress} onCancel={cancel} />}
              {loading && itinerary && itinerary.days.some((d) => d.items.length > 0) && (
                <MapView itinerary={itinerary} />
              )}
              {error && (
                <div className="card-warm border-red-200 bg-red-50/80 p-4 text-red-700">
                  <p className="font-medium">生成失败</p>
                  <p className="mt-1 text-sm break-anywhere">{error}</p>
                </div>
              )}
              {!loading && !error && !itinerary && (
                <div className="card-warm border-dashed border-warm-300 bg-warm-100/40 p-6 text-center sm:p-8">
                  <p className="text-lg font-semibold text-warm-text">👇 填好左侧，点「生成智能行程」</p>
                  <p className="mt-2 text-sm text-warm-muted">
                    上方会先查 {formState.departureCity || "出发地"} → {formState.city || "目的地"} 的火车票价
                  </p>
                  <ul className="mx-auto mt-4 max-w-md space-y-1.5 text-left text-xs text-warm-muted">
                    <li>✓ 全国任意城市（不限苏州/热门城）</li>
                    <li>✓ 酒店按预算排序，经济连锁优先</li>
                    <li>✓ 生成后可拖拽景点、按日刷新、三套方案对比</li>
                    <li>✓ 携程真价爬取需本地 npm run dev + scrape:login</li>
                  </ul>
                </div>
              )}
              {itinerary && !loading && (
                <div className="space-y-4">
                  <div className="card-warm p-4 text-sm text-warm-muted">
                    <p className="font-medium text-warm-text">已生成 {itinerary.city} 参考行程</p>
                    <p className="mt-1">含 3 套方案；行程页可拖拽改序、按日刷新。</p>
                  </div>
                  {itinerary.variants && itinerary.variants.length > 0 && (
                    <VariantCompare
                      itinerary={itinerary}
                      selected={selectedVariant}
                      onSelect={handleSelectVariant}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "map" && itinerary && <MapView itinerary={itinerary} />}

        {activeTab === "itinerary" && itinerary && (
          <ItineraryView
            itinerary={itinerary}
            mode="compact"
            onRefreshDay={(i) => refreshDayMutation.mutate(i)}
            refreshingDay={refreshingDay}
            onReorderDay={async (dayIndex, attractionIds) => {
              await reoptimizeMutation.mutateAsync({ dayIndex, attractionIds });
            }}
            reorderingDay={reorderingDay}
            travelers={lastRequest?.travelers ?? 2}
          />
        )}

        {activeTab === "compare" && itinerary && (
          <div className="space-y-4">
            <VariantCompare
              itinerary={itinerary}
              selected={selectedVariant}
              onSelect={handleSelectVariant}
            />
            {itinerary.budgetBreakdown && <BudgetSummary breakdown={itinerary.budgetBreakdown} />}
          </div>
        )}

        {activeTab === "rank" && itinerary?.topAttractions && (
          <DestinationRankList city={itinerary.city} attractions={itinerary.topAttractions} />
        )}

        {activeTab === "budget" && itinerary && (
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
            {!itinerary.budgetBreakdown && (
              <p className="text-center text-sm text-warm-muted">预算明细将在生成完成后显示</p>
            )}
          </div>
        )}

        {loading && activeTab !== "plan" && progress && (
          <div className="mt-4">
            <GenerateProgress progress={progress} compact onCancel={cancel} />
          </div>
        )}
      </main>

      {showMobileNav && (
        <AppTabs
          variant="mobile"
          active={activeTab}
          onChange={setActiveTab}
          disabled={disabledTabs}
        />
      )}

      <footer className="mt-4 border-t border-warm-200 py-3 text-center text-[11px] text-warm-muted sm:mt-6 sm:py-4 sm:text-xs">
        旅优 · 价格/车次以各平台实时为准
      </footer>
    </div>
  );
}
