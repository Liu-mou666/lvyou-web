"use client";

import type { SavedTrip } from "@/hooks/useItineraryHistory";

interface HistoryDiffPanelProps {
  current: SavedTrip;
  baseline: SavedTrip;
  onClose: () => void;
}

function diffNum(a: number, b: number): string {
  const d = a - b;
  if (d === 0) return "持平";
  return d > 0 ? `+¥${d}` : `-¥${Math.abs(d)}`;
}

export default function HistoryDiffPanel({ current, baseline, onClose }: HistoryDiffPanelProps) {
  const costDelta = current.itinerary.totalCost - baseline.itinerary.totalCost;
  const daysDelta = current.itinerary.days.length - baseline.itinerary.days.length;
  const visitA = current.itinerary.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "visit").length, 0);
  const visitB = baseline.itinerary.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "visit").length, 0);

  return (
    <div className="card-warm history-diff-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-warm-text">行程对比</h3>
        <button type="button" onClick={onClose} className="text-xs text-warm-muted">
          关闭
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-warm-50 p-3">
          <p className="font-medium text-warm-muted">基准</p>
          <p className="mt-1 font-semibold text-warm-text">
            {baseline.request.departureCity} → {baseline.request.city}
          </p>
          <p className="tabular-nums text-warm-muted">
            {baseline.itinerary.days.length}天 · ¥{baseline.itinerary.totalCost}
          </p>
        </div>
        <div className="rounded-lg border border-warm-400 bg-white p-3">
          <p className="font-medium text-warm-muted">当前</p>
          <p className="mt-1 font-semibold text-warm-text">
            {current.request.departureCity} → {current.request.city}
          </p>
          <p className="tabular-nums text-warm-muted">
            {current.itinerary.days.length}天 · ¥{current.itinerary.totalCost}
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-warm-text">
        <li>
          总花费：{diffNum(current.itinerary.totalCost, baseline.itinerary.totalCost)}
          {costDelta !== 0 && (
            <span className={costDelta > 0 ? "text-red-600" : "text-emerald-700"}>
              {" "}
              ({costDelta > 0 ? "更贵" : "更省"})
            </span>
          )}
        </li>
        <li>天数：{daysDelta === 0 ? "相同" : daysDelta > 0 ? `+${daysDelta}天` : `${daysDelta}天`}</li>
        <li>景点数：{visitA - visitB === 0 ? "相同" : visitA > visitB ? `+${visitA - visitB}` : `${visitA - visitB}`}</li>
      </ul>
    </div>
  );
}
