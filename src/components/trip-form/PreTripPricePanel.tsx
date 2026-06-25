"use client";

import TransportCompare from "@/components/TransportCompare";
import type { PricePreviewResult } from "@/lib/apis/preview-prices";
import type { TripFormState } from "@/hooks/useTripFormState";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-amber-100 text-amber-800",
  none: "bg-warm-100 text-warm-muted",
};

const FETCH_TIMEOUT_MS = 16_000;

interface PreTripPricePanelProps {
  state: TripFormState;
}

function canPreview(state: TripFormState): boolean {
  return state.departureCity.trim().length > 0 && state.city.trim().length > 0 && state.startDate.length > 0;
}

async function fetchPreview(payload: object): Promise<PricePreviewResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/preview-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "查价失败");
    return json as PricePreviewResult;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("查价超时，请点刷新重试或先点「生成行程」");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export default function PreTripPricePanel({ state }: PreTripPricePanelProps) {
  const payload = useMemo(
    () => ({
      departureCity: state.departureCity.trim(),
      city: state.city.trim(),
      startDate: state.startDate,
      travelers: state.travelers,
      priority: state.priority,
      totalBudget: state.totalBudget,
      departureStationMode: state.departureStationMode,
      mustVisit: state.mustVisitText
        .split(/[,，、/|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      preferDirectTrain: state.preferDirectTrain,
      seatPref: state.seatPref,
      maxHotelPerNight: state.maxHotelPerNight,
    }),
    [
      state.departureCity,
      state.city,
      state.startDate,
      state.travelers,
      state.priority,
      state.totalBudget,
      state.departureStationMode,
      state.mustVisitText,
      state.preferDirectTrain,
      state.seatPref,
      state.maxHotelPerNight,
    ],
  );

  const enabled = canPreview(state);

  const { data, isFetching, error, refetch, isFetched } = useQuery({
    queryKey: ["preview-prices", payload],
    queryFn: () => fetchPreview(payload),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (!enabled) {
    return (
      <div className="preview-price-panel preview-price-empty">
        <div className="preview-price-hero">
          <span className="text-2xl">🎫</span>
          <div>
            <p className="font-semibold text-warm-text">生成前先查价</p>
            <p className="mt-1 text-xs text-warm-muted">
              填好出发地、目的地和日期后，自动查火车票价（全国任意城市）
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-price-panel">
      <div className="preview-price-header">
        <div>
          <h3 className="text-sm font-bold text-warm-text">实时查价预览</h3>
          <p className="mt-0.5 text-[11px] text-warm-muted">
            {state.departureCity} → {state.city} · {state.startDate} · {state.travelers}人
            {data?.routeDistanceKm ? ` · 约 ${data.routeDistanceKm} km` : ""}
            {data?.juheConfigured ? " · 12306 已接入" : " · 深链查票"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="preview-refresh-btn"
        >
          {isFetching ? "查询中…" : "刷新查价"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error instanceof Error ? error.message : "查价失败"}
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-4">
          {data.recommendedTrain ? (
            <div className="preview-train-highlight">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-warm-700">推荐火车方案</p>
                  <p className="mt-1 text-sm font-bold text-warm-text">{data.recommendedTrain.title}</p>
                  <p className="mt-1 text-xs text-warm-muted">{data.recommendedTrain.description}</p>
                </div>
                <div className="text-right">
                  {data.recommendedTrain.totalPrice > 0 ? (
                    <>
                      <p className="text-2xl font-bold tabular-nums text-warm-600">
                        ¥{data.recommendedTrain.totalPrice}
                      </p>
                      <p className="text-[10px] text-warm-muted">
                        {state.travelers}人合计
                        {data.recommendedTrain.verified
                          ? " · 12306验证"
                          : data.recommendedTrain.type === "transfer"
                            ? " · 中转参考价"
                            : " · 参考价"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-amber-700">需链接查实价</p>
                  )}
                </div>
              </div>
              {data.recommendedTrain.priceNote && (
                <p className="mt-2 text-[11px] text-warm-muted">{data.recommendedTrain.priceNote}</p>
              )}
              {data.recommendedTrain.type === "transfer" && data.recommendedTrain.legs.length >= 2 && (
                <div className="mt-2 space-y-1 rounded-lg border border-warm-200 bg-white/80 p-2 text-[11px] text-warm-700">
                  {data.recommendedTrain.legs.map((leg, i) => (
                    <p key={i}>
                      第{i + 1}段 {leg.from} → {leg.to}
                      {leg.durationHours > 0 ? ` · ${leg.durationHours}h · ¥${leg.price}` : ""}
                    </p>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {data.recommendedTrain.links.slice(0, 4).map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="preview-link-btn"
                  >
                    {link.label} · {link.action}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              暂无铁路方案，可点下方携程链接查中转，或直接生成行程
            </p>
          )}

          {data.flightOption && (data.routeDistanceKm ?? 0) >= 500 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-900">
              <p className="font-semibold">长途可考虑飞机</p>
              <p className="mt-1 text-sky-800">{data.flightOption.description}</p>
              {data.flightOption.links[0] && (
                <a
                  href={data.flightOption.links[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="preview-link-btn mt-2 inline-block"
                >
                  携程查航班
                </a>
              )}
            </div>
          )}

          {data.tickets.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-warm-text">必去景点门票</p>
              <ul className="space-y-2">
                {data.tickets.map((t) => (
                  <li key={t.name} className="preview-ticket-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-warm-text">{t.name}</p>
                      <p className="mt-0.5 text-[11px] text-warm-muted">{t.note}</p>
                    </div>
                    <span className={`preview-conf-badge ${CONF_STYLE[t.confidence]}`}>
                      {t.free ? "免费" : t.pricePerPerson > 0 ? `¥${t.pricePerPerson}/人` : "待查"}
                    </span>
                    <a
                      href={t.links[0]?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="preview-link-btn shrink-0"
                    >
                      携程查票
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.tickets.length === 0 && state.mustVisitText.trim() && (
            <p className="text-xs text-warm-muted">在必去景点里填写名称后，这里会显示门票参考价与查票链接</p>
          )}

          {data.trainRoutes.length > 1 && (
            <details className="preview-details">
              <summary>查看全部 {data.trainRoutes.length} 个火车方案</summary>
              <div className="mt-3">
                <TransportCompare
                  trainRoutes={data.trainRoutes}
                  flightOption={data.flightOption}
                  recommended={data.recommendedTrain?.title}
                  routeDistanceKm={data.routeDistanceKm}
                  travelers={state.travelers}
                />
              </div>
            </details>
          )}

          <p className="text-[10px] text-warm-muted">
            更新于 {new Date(data.fetchedAt).toLocaleTimeString("zh-CN")} · 点左侧「生成智能行程」继续
          </p>
        </div>
      )}

      {!data && isFetching && (
        <div className="mt-4 flex items-center gap-2 text-sm text-warm-muted">
          <span className="preview-spinner" />
          正在查询火车与门票…（约 5–15 秒）
        </div>
      )}

      {!data && !isFetching && isFetched && !error && (
        <p className="mt-3 text-xs text-warm-muted">未返回查价结果，请点刷新重试</p>
      )}
    </div>
  );
}
