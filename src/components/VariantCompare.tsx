"use client";

import type { Itinerary, PlanObjective } from "@/lib/types";

interface VariantCompareProps {
  itinerary: Itinerary;
  onSelect: (objective: PlanObjective) => void;
  selected: PlanObjective;
}

export default function VariantCompare({ itinerary, onSelect, selected }: VariantCompareProps) {
  const variants = itinerary.variants;
  if (!variants || variants.length === 0) return null;

  return (
    <div className="card-warm p-4">
      <h3 className="text-base font-semibold text-warm-text">三套方案对比</h3>
      <p className="mt-1 text-xs text-warm-muted">省钱 / 省时 / 体验 — 点击切换主行程</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {variants.map((v) => {
          const it = v.itinerary;
          const active = v.objective === selected;
          const visitCount = it.days.reduce(
            (s, d) => s + d.items.filter((i) => i.kind === "visit").length,
            0,
          );
          return (
            <button
              key={v.objective}
              type="button"
              onClick={() => onSelect(v.objective)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-warm-500 bg-warm-glow ring-2 ring-warm-400/30"
                  : "border-warm-200 bg-white hover:border-warm-300"
              }`}
            >
              <p className="font-semibold text-warm-text">{v.label}</p>
              <p className="mt-1 text-xs text-warm-muted">{v.description}</p>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-warm-muted">总花费</dt>
                  <dd className="font-semibold tabular-nums text-warm-text">¥{it.totalCost}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-warm-muted">优化分</dt>
                  <dd className="tabular-nums">{it.optimizationScore}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-warm-muted">景点数</dt>
                  <dd className="tabular-nums">{visitCount}</dd>
                </div>
                {it.budgetBreakdown?.budgetGap && it.budgetBreakdown.budgetGap > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <dt>预算缺口</dt>
                    <dd className="tabular-nums">¥{it.budgetBreakdown.budgetGap}</dd>
                  </div>
                )}
              </dl>
              {active && <p className="mt-2 text-[10px] font-medium text-warm-600">当前方案</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
