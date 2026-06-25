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
    <div className="budget-summary-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="budget-summary-chip">
          <strong>{state.days}</strong> 天 · <strong>{state.travelers}</strong> 人
        </span>
        <span className="budget-summary-chip">约 <strong>{s.visits}</strong> 景点</span>
        <span className="budget-summary-chip">{state.startDate} → {s.endDate}</span>
        <span className="budget-summary-chip">
          预算 <strong>{budgetLevelLabel(s.inferred)}</strong>
        </span>
        {s.perPersonDay != null && (
          <span className="budget-summary-chip">¥{s.perPersonDay}/人/天</span>
        )}
      </div>
      {s.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-amber-800">
          {s.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
