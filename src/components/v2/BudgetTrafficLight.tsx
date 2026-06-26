"use client";

import type { PricePreviewResult } from "@/lib/apis/preview-prices";
import { computeFormSummary, type TripFormState } from "@/hooks/useTripFormState";
import { trainToPriceTruth } from "@/lib/price-truth";
import { PriceHero } from "@/components/v2/PriceBadge";
import { useMemo } from "react";

type TrafficStatus = "green" | "yellow" | "red" | "unknown";

interface BudgetTrafficLightProps {
  state: TripFormState;
  preview?: PricePreviewResult | null;
  loading?: boolean;
}

function estimateTotal(
  state: TripFormState,
  preview?: PricePreviewResult | null,
): { low: number; high: number; status: TrafficStatus; note: string } {
  const summary = computeFormSummary(state);
  const travelers = state.travelers;
  const days = state.days;

  const train = preview?.recommendedTrain ?? preview?.trainRoutes?.[0];
  const trainCost = train?.totalPrice ?? 0;

  const ticketSum = (preview?.tickets ?? []).reduce((s, t) => s + t.pricePerPerson * travelers, 0);
  const hotelPerNight = state.maxHotelPerNight > 0 ? state.maxHotelPerNight : summary.inferred === "budget" ? 180 : summary.inferred === "luxury" ? 680 : 320;
  const hotelCost = hotelPerNight * Math.max(0, days - 1) * 1; // 1 间房估
  const mealPerDay = summary.inferred === "budget" ? 80 : summary.inferred === "luxury" ? 200 : 120;
  const mealCost = mealPerDay * travelers * days;
  const localTransport = 40 * travelers * days;

  const low = Math.round(trainCost + ticketSum + hotelCost * 0.85 + mealCost * 0.9 + localTransport);
  const high = Math.round(trainCost + ticketSum + hotelCost * 1.15 + mealCost * 1.1 + localTransport * 1.2);

  if (state.totalBudget <= 0) {
    return { low, high, status: "unknown", note: "未设总预算，以下为参考区间" };
  }

  const budget = state.totalBudget;
  let status: TrafficStatus = "green";
  if (low > budget) status = "red";
  else if (high > budget) status = "yellow";

  const note =
    status === "green"
      ? "预估在预算内，可生成行程"
      : status === "yellow"
        ? "上限可能略超预算，建议收紧酒店或景点"
        : "预估下限已超预算，请调整天数或预算";

  return { low, high, status, note };
}

const STATUS_STYLE: Record<TrafficStatus, string> = {
  green: "traffic-green",
  yellow: "traffic-yellow",
  red: "traffic-red",
  unknown: "traffic-unknown",
};

const STATUS_LABEL: Record<TrafficStatus, string> = {
  green: "预算充足",
  yellow: "偏紧",
  red: "超预算",
  unknown: "参考区间",
};

export default function BudgetTrafficLight({ state, preview, loading }: BudgetTrafficLightProps) {
  const estimate = useMemo(() => estimateTotal(state, preview), [state, preview]);
  const train = preview?.recommendedTrain ?? preview?.trainRoutes?.[0];

  return (
    <div className="card-warm budget-traffic-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-warm-text">预算红绿灯</p>
          <p className="mt-0.5 text-xs text-warm-muted">{estimate.note}</p>
        </div>
        <div className={`traffic-light ${STATUS_STYLE[estimate.status]}`} aria-label={STATUS_LABEL[estimate.status]}>
          <span className="traffic-dot" />
          <span className="text-xs font-semibold">{STATUS_LABEL[estimate.status]}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-warm-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-warm-muted">预估花费</p>
          {loading ? (
            <p className="mt-1 text-sm text-warm-muted">计算中…</p>
          ) : (
            <p className="mt-1 text-xl font-bold tabular-nums text-warm-text">
              ¥{estimate.low.toLocaleString()}
              {estimate.high > estimate.low && (
                <span className="text-sm font-normal text-warm-muted"> ~ ¥{estimate.high.toLocaleString()}</span>
              )}
            </p>
          )}
          {state.totalBudget > 0 && (
            <p className="mt-1 text-xs text-warm-muted">你的总预算 ¥{state.totalBudget.toLocaleString()}</p>
          )}
        </div>

        {train && (
          <div className="rounded-xl border border-warm-200 p-3">
            <p className="text-[10px] font-medium text-warm-muted">去程火车（{state.travelers}人）</p>
            <PriceHero truth={trainToPriceTruth(train)} subtitle={train.title} className="!p-0 !shadow-none !bg-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
