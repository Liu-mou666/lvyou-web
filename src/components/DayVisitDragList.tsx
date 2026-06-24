"use client";

import type { POI } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

interface DayVisitDragListProps {
  visits: POI[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  disabled?: boolean;
}

export default function DayVisitDragList({ visits, onReorder, disabled }: DayVisitDragListProps) {
  const [items, setItems] = useState(visits);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(visits);
  }, [visits]);

  const commitReorder = useCallback(
    async (newItems: POI[]) => {
      setSaving(true);
      try {
        await onReorder(newItems.map((p) => p.id));
      } finally {
        setSaving(false);
      }
    },
    [onReorder],
  );

  function handleDrop(targetIdx: number) {
    if (dragIdx == null || dragIdx === targetIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setItems(next);
    setDragIdx(null);
    setOverIdx(null);
    commitReorder(next);
  }

  if (visits.length < 2) return null;

  return (
    <div className="mb-4 rounded-xl border border-dashed border-warm-300 bg-warm-50/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-warm-text">拖拽调整景点顺序</p>
        {saving && <span className="text-[10px] text-warm-muted">重算路线中…</span>}
      </div>
      <ul className="space-y-1.5">
        {items.map((poi, idx) => (
          <li
            key={poi.id}
            draggable={!disabled && !saving}
            onDragStart={() => setDragIdx(idx)}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(idx);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(idx);
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              overIdx === idx ? "border-warm-500 bg-warm-glow" : "border-warm-200 bg-white"
            } ${disabled || saving ? "opacity-60" : "cursor-grab active:cursor-grabbing"}`}
          >
            <span className="text-warm-muted" aria-hidden>⋮⋮</span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warm-500 text-xs font-bold text-white">
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-warm-text">{poi.name}</span>
            <span className="shrink-0 text-xs text-warm-muted">★{poi.rating}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-warm-muted">松手后自动重算市内交通与路程</p>
    </div>
  );
}
