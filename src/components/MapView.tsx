"use client";

import type { Itinerary, POI } from "@/lib/types";
import { useMemo, useState } from "react";

interface MapPoint {
  poi: POI;
  day: number;
  time: string;
  order: number;
}

function extractPoints(itinerary: Itinerary, dayFilter: number | "all"): MapPoint[] {
  const points: MapPoint[] = [];
  itinerary.days.forEach((day) => {
    if (dayFilter !== "all" && day.day !== dayFilter) return;
    let order = 0;
    day.items.forEach((item) => {
      if (item.kind === "visit" && item.poi && item.poi.lat && item.poi.lng) {
        points.push({ poi: item.poi, day: day.day, time: item.startTime, order: order++ });
      }
    });
  });
  return points;
}

function buildAmapUri(points: MapPoint[]): string | null {
  if (points.length === 0) return null;
  const markers = points
    .map((p) => `${p.poi.lng},${p.poi.lat},${encodeURIComponent(p.poi.name)}`)
    .join("|");
  return `https://uri.amap.com/marker?markers=${markers}&src=lvyou&callnative=0`;
}

function buildStaticMapUrl(points: MapPoint[]): string | null {
  if (points.length === 0) return null;
  const mid = points[Math.floor(points.length / 2)];
  const markers = points
    .slice(0, 30)
    .map((p, i) => `mid,0xE85D04,${i + 1}:${p.poi.lng},${p.poi.lat}`)
    .join("|");
  return `/api/map-static?zoom=12&markers=${encodeURIComponent(markers)}`;
}

interface MapViewProps {
  itinerary: Itinerary;
}

export default function MapView({ itinerary }: MapViewProps) {
  const [dayFilter, setDayFilter] = useState<number | "all">("all");

  const points = useMemo(() => extractPoints(itinerary, dayFilter), [itinerary, dayFilter]);
  const mapUri = useMemo(() => buildAmapUri(points), [points]);
  const staticMapUrl = useMemo(() => buildStaticMapUrl(points), [points]);

  if (itinerary.days.length === 0) {
    return (
      <div className="card-warm border-dashed border-warm-300 p-8 text-center text-sm text-warm-muted">
        行程生成中，地图将在景点就绪后显示
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card-warm p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-warm-text">行程地图</h3>
            <p className="mt-0.5 text-xs text-warm-muted">
              {points.length} 个景点 · 内嵌静态图 + 高德导航
            </p>
          </div>
          {mapUri && (
            <a
              href={mapUri}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary shrink-0 !py-2.5 !text-sm"
            >
              高德打开全图
            </a>
          )}
        </div>

        {staticMapUrl && (
          <div className="mt-3 overflow-hidden rounded-xl border border-warm-200 bg-warm-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={staticMapUrl}
              alt="行程景点分布"
              className="h-48 w-full object-cover sm:h-56"
              loading="lazy"
            />
          </div>
        )}

        <div className="snap-scroll-x mt-3 -mx-1 flex gap-2 px-1">
          <button
            type="button"
            onClick={() => setDayFilter("all")}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              dayFilter === "all" ? "bg-warm-500 text-white" : "border border-warm-200 bg-white text-warm-text"
            }`}
          >
            全部
          </button>
          {itinerary.days.map((d) => (
            <button
              key={d.day}
              type="button"
              onClick={() => setDayFilter(d.day)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                dayFilter === d.day ? "bg-warm-500 text-white" : "border border-warm-200 bg-white text-warm-text"
              }`}
            >
              第{d.day}天
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="card-warm p-6 text-center text-sm text-warm-muted">该日暂无可标注的景点坐标</div>
      ) : (
        <ul className="space-y-2">
          {points.map((pt, i) => {
            const singleUri = `https://uri.amap.com/marker?position=${pt.poi.lng},${pt.poi.lat}&name=${encodeURIComponent(pt.poi.name)}&callnative=0`;
            const photo = pt.poi.photoUrls?.[0] ?? pt.poi.photoUrl;
            return (
              <li key={`${pt.poi.id}-${i}`} className="card-warm flex gap-3 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warm-500 text-sm font-bold text-white">
                  {pt.order + 1}
                </span>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={pt.poi.name}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-xs text-warm-muted">
                    无图
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-warm-text break-anywhere">{pt.poi.name}</p>
                    <span className="shrink-0 text-[11px] text-warm-muted">第{pt.day}天 {pt.time}</span>
                  </div>
                  {pt.poi.address && (
                    <p className="mt-1 text-xs text-warm-muted break-anywhere line-clamp-2">{pt.poi.address}</p>
                  )}
                  <a
                    href={singleUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-[36px] items-center text-xs font-medium text-warm-600"
                  >
                    高德导航 →
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
