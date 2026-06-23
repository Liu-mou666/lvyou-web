"use client";

import ItineraryView from "@/components/ItineraryView";
import TripForm from "@/components/TripForm";
import type { Itinerary, TripRequest } from "@/lib/types";
import { useRef, useState } from "react";

export default function HomePage() {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [lastRequest, setLastRequest] = useState<TripRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  async function handleGenerate(request: TripRequest) {
    setLoading(true);
    setError(null);
    setLastRequest(request);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setItinerary(data);
      requestAnimationFrame(() => {
        document.getElementById("itinerary-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
      setItinerary(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (!itinerary || !lastRequest) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lastRequest, dayIndex: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "刷新失败");
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) => (i === 0 ? data.dayPlan : d)),
        generatedAt: data.refreshedAt,
        realtimeNote: data.note,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-warm-50 via-[#fffbf7] to-warm-100 safe-bottom">
      <header
        className="sticky top-0 z-30 border-b border-warm-200 bg-white/95 backdrop-blur-md"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold tracking-tight text-warm-text sm:text-lg">
              <span className="text-warm-500">旅优</span> · 决策参谋
            </h1>
            <p className="hidden text-xs text-warm-muted sm:block">
              高德 POI · 铁路站码库 · 文旅部 5A 名录 · 可溯源推荐
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {itinerary && (
              <>
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="touch-target rounded-xl border border-warm-200 bg-warm-100 px-3 py-2 text-xs font-medium text-warm-700 sm:hidden"
                >
                  改参数
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading}
                  className="touch-target rounded-xl border border-warm-300 bg-warm-glow px-3 py-2 text-xs font-medium text-warm-700 disabled:opacity-50 sm:px-4"
                >
                  {loading ? "…" : "刷新首日"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <div className={`mb-4 sm:mb-6 ${itinerary ? "hidden sm:block" : ""}`}>
          <h2 className="text-xl font-bold tracking-tight text-warm-text sm:text-2xl">旅行方案生成</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-warm-muted">
            基于高德地理数据、全国铁路枢纽站码库与文旅部 5A 景区名录，生成可溯源的参考行程。
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
          <div ref={formRef} className="lg:col-span-4 lg:sticky lg:top-[4.5rem] lg:self-start">
            <TripForm onSubmit={handleGenerate} loading={loading} />
          </div>

          <div id="itinerary-result" className="relative lg:col-span-8">
            {loading && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm sm:absolute sm:inset-0 sm:rounded-2xl sm:z-10">
                <div className="px-6 text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-warm-200 border-t-warm-500" />
                  <p className="mt-4 text-sm font-medium text-warm-text">正在融合高德数据与铁路枢纽方案…</p>
                  <p className="mt-1 text-xs text-warm-muted">全国目的地 · 约 20–40 秒</p>
                </div>
              </div>
            )}

            {error && (
              <div className="card-warm border-red-200 bg-red-50/80 p-4 text-red-700 sm:p-5">
                <p className="font-medium">生成失败</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            )}

            {!error && !itinerary && !loading && (
              <div className="card-warm border-dashed border-warm-300 bg-warm-100/50 p-8 text-center sm:p-10">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-glow text-2xl">
                  ✈
                </div>
                <p className="font-medium text-warm-text">填写参数后生成参考行程</p>
                <p className="mt-2 text-xs text-warm-muted">
                  含：交通对比 · 每日时间轴 · 5A 标签 · 平台深链 · 推荐依据
                </p>
              </div>
            )}

            {itinerary && <ItineraryView itinerary={itinerary} />}
          </div>
        </div>
      </main>

      {itinerary && (
        <button
          type="button"
          onClick={scrollToForm}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-warm-400 to-warm-500 text-white shadow-lg shadow-warm-500/30 sm:hidden"
          style={{ bottom: "max(1rem, var(--safe-bottom))" }}
          aria-label="修改参数"
        >
          ✎
        </button>
      )}

      <footer className="mt-6 border-t border-warm-200 py-4 text-center text-xs text-warm-muted safe-bottom">
        旅优 · 私人参考工具 · 价格/车次以各平台实时为准
      </footer>
    </div>
  );
}
