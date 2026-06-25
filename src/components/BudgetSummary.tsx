import type { BudgetBreakdown } from "@/lib/types";

interface BudgetSummaryProps {
  breakdown: BudgetBreakdown;
  compact?: boolean;
}

const ROWS: { key: "travel" | "lodging" | "meals" | "attractions" | "localTransport"; label: string }[] = [
  { key: "travel", label: "去程交通" },
  { key: "lodging", label: "住宿" },
  { key: "meals", label: "餐饮" },
  { key: "attractions", label: "景点门票" },
  { key: "localTransport", label: "市内交通" },
];

const STATUS: Record<BudgetBreakdown["status"], { label: string; cls: string }> = {
  within: { label: "预算内", cls: "bg-emerald-100 text-emerald-800" },
  tight: { label: "预算偏紧", cls: "bg-amber-100 text-amber-800" },
  over: { label: "超出预算", cls: "bg-red-100 text-red-800" },
  unset: { label: "未设上限", cls: "bg-warm-100 text-warm-muted" },
};

export default function BudgetSummary({ breakdown, compact }: BudgetSummaryProps) {
  const pct = breakdown.limit > 0 ? Math.min(100, Math.round((breakdown.total / breakdown.limit) * 100)) : 0;
  const status = STATUS[breakdown.status];

  if (compact) {
    return (
      <section className="card-warm px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-warm-muted">预算合计</p>
            <p className="text-lg font-bold tabular-nums text-warm-600">¥{breakdown.total}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>
        </div>
        {breakdown.limit > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-warm-200">
            <div
              className={`h-full rounded-full ${breakdown.status === "over" ? "bg-red-500" : "bg-warm-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card-warm p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-warm-text">预算明细</h3>
          <p className="mt-1 text-xs text-warm-muted">含去程交通、住宿、餐饮、景点与市内交通（2人参考）</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>
      </div>

      {breakdown.limit > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-warm-muted">
            <span>已用 ¥{breakdown.total}</span>
            <span className="tabular-nums font-medium text-warm-text">上限 ¥{breakdown.limit}（{pct}%）</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-warm-200">
            <div
              className={`h-full rounded-full transition-all ${
                breakdown.status === "over" ? "bg-red-500" : breakdown.status === "tight" ? "bg-warm-accent" : "bg-warm-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {breakdown.budgetGap && breakdown.budgetGap > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          仍缺约 <strong className="tabular-nums">¥{breakdown.budgetGap}</strong> 才能覆盖当前方案，建议提高总预算或缩短天数。
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
        {ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between rounded-xl bg-warm-100 px-3 py-2.5 text-sm">
            <span className="text-warm-muted">{label}</span>
            <span className="font-semibold tabular-nums text-warm-text">¥{breakdown[key]}</span>
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between rounded-xl border border-warm-300 bg-warm-glow px-3 py-3 text-sm">
          <span className="font-semibold text-warm-700">合计</span>
          <span className="text-xl font-bold tabular-nums text-warm-600">¥{breakdown.total}</span>
        </div>
      </div>

      {breakdown.savingsTips.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-warm-200 pt-3 text-xs leading-relaxed text-amber-800">
          {breakdown.savingsTips.map((tip) => (
            <li key={tip}>· {tip}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
