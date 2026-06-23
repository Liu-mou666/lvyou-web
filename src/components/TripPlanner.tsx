"use client";

import AppTabs, { type AppTab } from "@/components/AppTabs";
import BudgetSummary from "@/components/BudgetSummary";
import DestinationRankList from "@/components/DestinationRankList";
import GenerateProgress from "@/components/GenerateProgress";
import ItineraryView from "@/components/ItineraryView";
import MapView from "@/components/MapView";
import TransportCompare from "@/components/TransportCompare";
import TripForm from "@/components/TripForm";
import { useGenerateStream } from "@/hooks/useGenerateStream";
import type { Itinerary, TripRequest } from "@/lib/types";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

function tabDisabled(itinerary: Itinerary | null): Partial<Record<AppTab, boolean>> {
  if (!itinerary) {
    return { map: true, itinerary: true, rank: true, budget: true };
  }
  const hasDays = itinerary.days.length > 0;
  const hasRank = (itinerary.topAttractions?.length ?? 0) > 0;
  const hasBudget =
    itinerary.budgetBreakdown != null ||
    (itinerary.trainRoutes?.length ?? 0) > 0 ||
    itinerary.flightOption != null;
  return {
    map: !hasDays,
    itinerary: !hasDays,
    rank: !hasRank,
    budget: !hasBudget,
  };
}

export default function TripPlanner() {
  const { generate, loading, progress, itinerary, error, setItinerary, setError } = useGenerateStream();
  const [activeTab, setActiveTab] = useState<AppTab>("plan");
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);

  const disabledTabs = useMemo(() => tabDisabled(itinerary), [itinerary]);

  useEffect(() => {
    if (itinerary?.days.length && !loading) {
      setActiveTab((prev) => (prev === "plan" ? "itinerary" : prev));
    }
  }, [itinerary?.days.length, loading]);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!itinerary || !lastRequest) throw new Error("无可刷新行程");
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lastRequest, dayIndex: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "刷新失败");
      return data;
    },
    onSuccess: (data) => {
      if (!itinerary) return;
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) => (i === 0 ? data.dayPlan : d)),
        generatedAt: data.refreshedAt,
        realtimeNote: data.note,
      });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "刷新失败");
    },
  });

  async function handleGenerate(request: TripRequest) {
    setLastRequest(request);
    setActiveTab("plan");
    await generate(request);
  }

  const showMobileNav = activeTab !== "plan" || itinerary != null;
  const refreshing = refreshMutation.isPending;

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
                  <span className="text-warm-muted"> · 智能攻略</span>
                )}
              </h1>
            </div>
            {itinerary && (
              <button
                type="button"
                onClick={() => refreshMutation.mutate()}
                disabled={loading || refreshing}
                className="touch-target shrink-0 rounded-xl border border-warm-300 bg-warm-glow px-3 py-2 text-xs font-medium text-warm-700 disabled:opacity-50"
              >
                {refreshing ? "…" : "刷新"}
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
            <div className="lg:col-span-5 lg:sticky lg:top-[7.5rem] lg:self-start">
              <TripForm onSubmit={handleGenerate} loading={loading} />
            </div>
            <div className="space-y-4 lg:col-span-7">
              {loading && progress && <GenerateProgress progress={progress} />}
              {error && (
                <div className="card-warm border-red-200 bg-red-50/80 p-4 text-red-700">
                  <p className="font-medium">生成失败</p>
                  <p className="mt-1 text-sm break-anywhere">{error}</p>
                </div>
              )}
              {!loading && !error && !itinerary && (
                <div className="card-warm border-dashed border-warm-300 bg-warm-100/50 p-8 text-center sm:p-10">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-glow text-2xl">
                    ✈
                  </div>
                  <p className="font-medium text-warm-text">填写参数后生成行程</p>
                  <p className="mt-2 text-xs text-warm-muted">生成后可切换地图、行程、榜单与预算</p>
                </div>
              )}
              {itinerary && !loading && (
                <div className="card-warm p-4 text-sm text-warm-muted">
                  <p className="font-medium text-warm-text">已生成 {itinerary.city} 参考行程</p>
                  <p className="mt-1">请点顶部或底部 Tab 查看地图、每日安排、必去榜与预算明细。</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "map" && itinerary && <MapView itinerary={itinerary} />}

        {activeTab === "itinerary" && itinerary && (
          <ItineraryView itinerary={itinerary} mode="days-only" />
        )}

        {activeTab === "rank" && itinerary?.topAttractions && (
          <DestinationRankList city={itinerary.city} attractions={itinerary.topAttractions} />
        )}

        {activeTab === "budget" && itinerary && (
          <div className="space-y-4">
            {itinerary.budgetBreakdown && <BudgetSummary breakdown={itinerary.budgetBreakdown} />}
            <TransportCompare
              trainRoutes={itinerary.trainRoutes}
              flightOption={itinerary.flightOption}
              busOption={itinerary.busOption}
              recommended={itinerary.recommendedTransport}
              routeDistanceKm={itinerary.routeDistanceKm}
              transportEvidence={itinerary.transportEvidence}
            />
            {!itinerary.budgetBreakdown && (
              <p className="text-center text-sm text-warm-muted">预算明细将在生成完成后显示</p>
            )}
          </div>
        )}

        {loading && activeTab !== "plan" && progress && (
          <div className="mt-4">
            <GenerateProgress progress={progress} compact />
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
