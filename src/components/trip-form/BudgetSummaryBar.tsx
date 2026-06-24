"use client";

import type { TripFormState } from "@/hooks/useTripFormState";
import { computeFormSummary } from "@/hooks/useTripFormState";
import { budgetLevelLabel } from "@/lib/trip-form-options";

interface BudgetSummaryBarProps {
  state: TripFormState;
}

export default function BudgetSummaryBar({ state }: BudgetSummaryBarProps) {
  const s = computeFormSummary(state);

  return (
    <div className="rounded-xl border border-warm-200 bg-warm-100/70 px-3 py-2.5 text-xs text-warm-text">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          <strong>{state.days}</strong> 天 · <strong>{state.travelers}</strong> 人
        </span>
        <span>约 <strong>{s.visits}</strong> 个景点</span>
        <span>{state.startDate} → {s.endDate}</span>
        <span>
          预算：
          <strong>{budgetLevelLabel(s.inferred)}</strong>
          {s.budgetLocked ? "（由总预算推导）" : "（手动等级）"}
        </span>
        {s.perPersonDay != null && <span>约 ¥{s.perPersonDay}/人/天</span>}
        <span>火车：{s.stationLabel}</span>
      </div>
      {s.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-warm-600">
          {s.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-warm-muted sm:text-xs">
        生成后可在「预算」「交通」Tab 查看分项与火车方案；总预算不含往返火车时可分开估算。
      </p>
    </div>
  );
}
