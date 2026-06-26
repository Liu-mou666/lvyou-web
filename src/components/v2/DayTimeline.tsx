"use client";

import PriceBadge, { PriceHero } from "@/components/v2/PriceBadge";
import DayVisitDragList from "@/components/DayVisitDragList";
import { poiToPriceTruth } from "@/lib/price-truth";
import { transportIcon, transportLabel } from "@/lib/transport";
import { weatherIcon } from "@/lib/weather";
import type { Itinerary, TimelineItem } from "@/lib/types";
import { useState } from "react";

interface DayTimelineProps {
  itinerary: Itinerary;
  onRefreshDay?: (dayIndex: number) => void;
  refreshingDay?: number | null;
  onReorderDay?: (dayIndex: number, attractionIds: string[]) => Promise<void>;
  reorderingDay?: number | null;
  travelers?: number;
}

function TimelineNode({ item, travelers }: { item: TimelineItem; travelers: number }) {
  if (item.kind === "transport" && item.transport) {
    const t = item.transport;
    return (
      <div className="timeline-node timeline-node-transport">
        <div className="timeline-rail">
          <span className="timeline-dot" />
        </div>
        <div className="timeline-content">
          <p className="timeline-time tabular-nums">
            {item.startTime} – {item.endTime}
          </p>
          <p className="text-sm font-medium text-warm-text">
            {transportIcon(t.mode)} {transportLabel(t.mode)} · {t.from} → {t.to}
          </p>
          <p className="text-xs text-warm-muted">
            {t.distanceKm}km · {t.durationMinutes}分钟
            {t.cost > 0 && <span className="tabular-nums"> · ¥{t.cost}</span>}
          </p>
        </div>
      </div>
    );
  }

  if (item.poi) {
    const truth = poiToPriceTruth(item.poi, travelers);
    return (
      <div className="timeline-node timeline-node-visit">
        <div className="timeline-rail">
          <span className="timeline-dot timeline-dot-visit" />
        </div>
        <div className="timeline-content card-warm p-3">
          <p className="timeline-time tabular-nums">
            {item.startTime} – {item.endTime}
          </p>
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-warm-text break-anywhere">{item.poi.name}</h4>
            <PriceBadge truth={truth} compact />
          </div>
          {truth.amount > 0 && (
            <p className="mt-1 text-lg font-bold tabular-nums text-warm-600">{truth.amount > 0 ? `¥${truth.amount}` : ""}</p>
          )}
          {item.note && <p className="mt-1 text-xs text-warm-muted">{item.note}</p>}
        </div>
      </div>
    );
  }

  return null;
}

export default function DayTimeline({
  itinerary,
  onRefreshDay,
  refreshingDay,
  onReorderDay,
  reorderingDay,
  travelers = 2,
}: DayTimelineProps) {
  const [activeDay, setActiveDay] = useState(0);
  const day = itinerary.days[activeDay];
  if (!day) return null;

  const visits = day.items.filter((i) => i.kind === "visit" && i.poi).map((i) => i.poi!);

  return (
    <div className="day-timeline">
      {itinerary.days.length > 1 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
          {itinerary.days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              onClick={() => setActiveDay(i)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
                activeDay === i ? "bg-warm-500 text-white" : "border border-warm-200 bg-white text-warm-text"
              }`}
            >
              第{d.day}天
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-warm-text">
            第 {day.day} 天 <span className="text-sm font-normal text-warm-muted">{day.date}</span>
          </h3>
          <p className="text-xs text-warm-muted">{day.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          {onRefreshDay && (
            <button
              type="button"
              disabled={refreshingDay === activeDay}
              onClick={() => onRefreshDay(activeDay)}
              className="rounded-lg border border-warm-300 px-2.5 py-1.5 text-[11px] font-medium"
            >
              {refreshingDay === activeDay ? "刷新中…" : "更新价格"}
            </button>
          )}
          <span className="flex items-center gap-1 rounded-lg bg-warm-100 px-2 py-1 text-xs">
            {weatherIcon(day.weather.condition)}
            {day.weather.tempLow}°~{day.weather.tempHigh}°
          </span>
        </div>
      </div>

      {onReorderDay && visits.length >= 2 && (
        <DayVisitDragList
          visits={visits}
          disabled={reorderingDay === activeDay}
          onReorder={async (ids) => onReorderDay(activeDay, ids)}
        />
      )}

      <div className="timeline-list">
        {day.items.map((item, idx) => (
          <TimelineNode key={`${day.day}-${idx}`} item={item} travelers={travelers} />
        ))}
      </div>

      <div className="mt-4 flex gap-4 border-t border-warm-200 pt-3 text-xs text-warm-muted">
        <span>路程 {day.totalDistance}km</span>
        <span className="tabular-nums">花费 ¥{day.totalCost}</span>
      </div>

      {day.hotel && (
        <div className="mt-4 rounded-xl border border-warm-300 bg-warm-glow/30 p-4">
          <p className="text-xs font-medium text-warm-700">当晚住宿</p>
          <p className="mt-1 font-semibold">{day.hotel.name}</p>
          <PriceHero truth={poiToPriceTruth(day.hotel, travelers)} className="mt-2 !p-0 !bg-transparent !shadow-none" />
        </div>
      )}
    </div>
  );
}
