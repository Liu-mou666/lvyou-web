"use client";

import type { SavedTrip } from "@/hooks/useItineraryHistory";

interface ItineraryHistoryPanelProps {
  items: SavedTrip[];
  onLoad: (item: SavedTrip) => void;
  onRemove: (id: string) => void;
  onExport: (item: SavedTrip) => void;
  /** 2.0：与当前行程对比 */
  onCompare?: (item: SavedTrip) => void;
}

export default function ItineraryHistoryPanel({
  items,
  onLoad,
  onRemove,
  onExport,
  onCompare,
}: ItineraryHistoryPanelProps) {
  if (items.length === 0) return null;

  return (
    <div className="card-warm p-4">
      <h3 className="text-sm font-semibold text-warm-text">最近行程</h3>
      <p className="mt-0.5 text-xs text-warm-muted">本地保存，最多 {items.length} 条</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warm-200 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium text-warm-text">{item.city} · {item.days}天</p>
              <p className="text-xs text-warm-muted">
                ¥{item.totalCost} · {new Date(item.savedAt).toLocaleDateString("zh-CN")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onLoad(item)}
                className="rounded-lg bg-warm-500 px-3 py-1.5 text-xs font-medium text-white"
              >
                载入
              </button>
              {onCompare && (
                <button
                  type="button"
                  onClick={() => onCompare(item)}
                  className="rounded-lg border border-warm-400 px-2.5 py-1.5 text-xs font-medium text-warm-700"
                >
                  对比
                </button>
              )}
              <button
                type="button"
                onClick={() => onExport(item)}
                className="rounded-lg border border-warm-200 px-2.5 py-1.5 text-xs text-warm-text"
              >
                导出
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-lg border border-warm-200 px-2.5 py-1.5 text-xs text-warm-muted"
              >
                删
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
