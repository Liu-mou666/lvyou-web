"use client";

import DayVisitDragList from "@/components/DayVisitDragList";
import PriceCheckBar from "@/components/PriceCheckBar";
import EvidencePanel from "@/components/EvidencePanel";
import BudgetSummary from "@/components/BudgetSummary";
import TransportCompare from "@/components/TransportCompare";
import DestinationRankList from "@/components/DestinationRankList";
import type { Itinerary, POI, TimelineItem } from "@/lib/types";
import { valueRankLabel } from "@/lib/realtime-engine";
import { transportIcon, transportLabel } from "@/lib/transport";
import { weatherIcon } from "@/lib/weather";
import { useState } from "react";

interface ItineraryViewProps {
  itinerary: Itinerary;
  /** full：含预算/交通/榜单；days-only：仅摘要与每日行程 */
  mode?: "full" | "days-only";
  onRefreshDay?: (dayIndex: number) => void;
  refreshingDay?: number | null;
  onReorderDay?: (dayIndex: number, attractionIds: string[]) => Promise<void>;
  reorderingDay?: number | null;
  travelers?: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  amap: "bg-blue-50 text-blue-700 border-blue-200",
  dianping: "bg-orange-50 text-orange-700 border-orange-200",
  meituan: "bg-yellow-50 text-yellow-800 border-yellow-200",
  ctrip: "bg-sky-50 text-sky-700 border-sky-200",
  fliggy: "bg-purple-50 text-purple-700 border-purple-200",
};

function PlatformButtons({ item }: { item: TimelineItem }) {
  if (!item.poi?.links?.length) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
      {item.poi.links.map((link, i) => (
        <a
          key={`${link.platform}-${i}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex min-h-[44px] items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium active:opacity-80 sm:inline-flex sm:min-h-0 sm:py-1.5 ${PLATFORM_COLORS[link.platform] ?? "bg-warm-50 text-warm-text border-warm-200"}`}
        >
          {link.label} · {link.action} →
        </a>
      ))}
    </div>
  );
}

function POILinks({ poi }: { poi: POI }) {
  if (!poi.links?.length) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
      {poi.links.map((link, i) => (
        <a
          key={`${link.platform}-${i}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex min-h-[44px] items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium active:opacity-80 sm:inline-flex sm:min-h-0 sm:py-1.5 ${PLATFORM_COLORS[link.platform] ?? "bg-warm-50 border-warm-200 text-warm-text"}`}
        >
          {link.label} · {link.action} →
        </a>
      ))}
    </div>
  );
}

function POIPhotos({ poi }: { poi: POI }) {
  const photos = poi.photoUrls?.length ? poi.photoUrls : poi.photoUrl ? [poi.photoUrl] : [];
  if (photos.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl bg-warm-100 text-xs text-warm-muted sm:h-28">
        暂无实拍图
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-1.5">
      {photos.slice(0, 3).map((url, i) => (
        <a
          key={url}
          href={poi.links?.find((l) => l.platform === "amap" && l.action.includes("详情"))?.url ?? url}
          target="_blank"
          rel="noopener noreferrer"
          className="overflow-hidden rounded-xl bg-warm-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${poi.name}${i + 1}`} className="h-44 w-full object-cover sm:h-32" loading="lazy" referrerPolicy="no-referrer" />
        </a>
      ))}
    </div>
  );
}

function TimelineEntry({ item, travelers = 2 }: { item: TimelineItem; travelers?: number }) {
  if (item.kind === "transport" && item.transport) {
    const t = item.transport;
    return (
      <div className="mb-3 rounded-xl bg-warm-100 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-warm-text">
          <span>{transportIcon(t.mode)}</span>
          <span>{transportLabel(t.mode)}</span>
          <span className="text-xs tabular-nums text-warm-muted">{item.startTime}-{item.endTime}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed break-anywhere text-warm-muted">
          {t.from} → {t.to} · {t.distanceKm}km · {t.durationMinutes}分钟{t.cost > 0 ? ` · ¥${t.cost}` : ""}
        </p>
      </div>
    );
  }

  if (!item.poi) return null;
  const poi = item.poi;
  const rt = item.realtime;
  const isMeal = item.kind === "meal";

  return (
    <article className="mb-4 overflow-hidden rounded-2xl border border-warm-200 bg-white shadow-sm">
      <div className={`px-3 py-2 text-xs font-semibold ${isMeal ? "bg-amber-50 text-amber-800" : "bg-warm-glow text-warm-700"}`}>
        {isMeal ? "🍽 餐饮" : "📍 景点"} · {item.startTime} - {item.endTime}
      </div>
      <div className="p-3 sm:p-4">
        <POIPhotos poi={poi} />
        <div className="mt-3 flex items-start justify-between gap-2">
          <h4 className="min-w-0 flex-1 text-base font-bold leading-snug text-warm-text break-anywhere">{poi.name}</h4>
          <span className="shrink-0 rounded-lg bg-warm-glow px-2 py-1 text-sm font-bold text-warm-600">
            ★{poi.compositeRating ?? poi.rating}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {poi.authorityTag && (
            <span className="rounded-md bg-warm-glow px-2 py-0.5 text-[11px] font-medium text-warm-700">5A {poi.authorityTag}</span>
          )}
          {rt?.valueRank === "high" && (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{valueRankLabel(rt.valueRank)}</span>
          )}
          {rt && <span className="rounded-md bg-warm-100 px-2 py-0.5 text-[11px] text-warm-muted">综合 {rt.score}</span>}
        </div>
        {poi.address && <p className="mt-2 text-xs leading-relaxed break-anywhere text-warm-muted">{poi.address}</p>}
        {poi.priceNote && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-800">{poi.priceNote}</p>
        )}
        <PriceCheckBar poi={poi} travelers={travelers} />
        {item.note && (
          <div className="mt-2 rounded-lg bg-warm-50 px-2.5 py-2">
            <p className="text-[11px] font-semibold text-warm-700">推荐理由</p>
            <p className="mt-0.5 text-xs leading-relaxed text-warm-600 break-anywhere">{item.note}</p>
          </div>
        )}
        {rt && rt.scoreReasons.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {rt.scoreReasons.map((r) => (
              <li key={r} className="text-[11px] text-warm-muted before:mr-1 before:text-warm-400 before:content-['·']">{r}</li>
            ))}
          </ul>
        )}
        {item.alternatives && item.alternatives.length > 0 && (
          <details className="mt-2 rounded-lg border border-warm-200 bg-warm-50/50 px-2.5 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-warm-600">
              备选 {item.alternatives.length} 家（为何未选）
            </summary>
            <ul className="mt-1.5 space-y-1">
              {item.alternatives.map((alt) => (
                <li key={alt.id} className="text-[11px] text-warm-muted break-anywhere">
                  {alt.name} · ★{alt.rating}
                  {alt.pricePerPerson > 0 ? ` · 约¥${alt.pricePerPerson}/人` : ""}
                  {alt.reviewCount >= 100 ? ` · ${alt.reviewCount}评` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
        {item.evidence && item.evidence.length > 0 && <div className="mt-2"><EvidencePanel evidence={item.evidence} compact /></div>}
      </div>
    </article>
  );
}

function DayContent({
  day,
  showHeader = true,
  dayIndex,
  onRefreshDay,
  refreshing,
  onReorderDay,
  reordering,
  travelers = 2,
}: {
  day: Itinerary["days"][0];
  showHeader?: boolean;
  dayIndex?: number;
  onRefreshDay?: (dayIndex: number) => void;
  refreshing?: boolean;
  onReorderDay?: (dayIndex: number, ids: string[]) => Promise<void>;
  reordering?: boolean;
  travelers?: number;
}) {
  const visits = day.items.filter((i) => i.kind === "visit" && i.poi).map((i) => i.poi!);

  return (
    <>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between border-b border-warm-200 pb-3 gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-warm-text sm:text-lg">
              第 {day.day} 天 <span className="text-sm text-warm-muted">{day.date}</span>
            </h3>
            <p className="mt-0.5 text-xs text-warm-muted sm:text-sm">{day.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onRefreshDay != null && dayIndex != null && (
              <button
                type="button"
                disabled={refreshing}
                onClick={() => onRefreshDay(dayIndex)}
                className="rounded-lg border border-warm-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-warm-700 disabled:opacity-50"
              >
                {refreshing ? "刷新中…" : "刷新本日"}
              </button>
            )}
            <div className="flex items-center gap-1 rounded-xl bg-warm-100 px-2.5 py-1.5 text-xs sm:text-sm">
              {weatherIcon(day.weather.condition)}
              <span className="tabular-nums">{day.weather.tempLow}°~{day.weather.tempHigh}°</span>
            </div>
          </div>
        </div>
      )}
      {onReorderDay != null && dayIndex != null && visits.length >= 2 && (
        <DayVisitDragList
          visits={visits}
          disabled={reordering}
          onReorder={async (ids) => onReorderDay(dayIndex, ids)}
        />
      )}
      {day.items.map((item, idx) => (
        <TimelineEntry key={`${day.day}-${idx}-${item.poi?.id ?? item.transport?.mode}`} item={item} travelers={travelers} />
      ))}
      <div className="flex gap-3 border-t border-warm-200 pt-3 text-xs text-warm-muted">
        <span>路程 {day.totalDistance}km</span>
        <span>花费 ¥{day.totalCost}</span>
      </div>
      {day.hotel && (
        <div className="mt-3 rounded-xl border border-warm-300 bg-warm-glow/40 p-3">
          <p className="text-xs font-medium text-warm-700">当晚住宿推荐</p>
          <p className="mt-1 font-semibold text-warm-text break-anywhere">{day.hotel.name}</p>
          {day.hotel.priceNote ? (
            <p className="mt-1 text-[11px] leading-relaxed text-amber-800">{day.hotel.priceNote}</p>
          ) : day.hotel.pricePerPerson > 0 ? (
            <p className="text-sm text-warm-muted">高德参考 ¥{day.hotel.pricePerPerson}/晚</p>
          ) : null}
          {day.hotelAlternatives && day.hotelAlternatives.length > 0 && (
            <p className="mt-1 text-[10px] text-warm-muted">
              备选：{day.hotelAlternatives.map((h) => h.name).join("、")}
            </p>
          )}
          <POILinks poi={day.hotel} />
          <PriceCheckBar poi={day.hotel} travelers={travelers} />
        </div>
      )}
    </>
  );
}

export default function ItineraryView({
  itinerary,
  mode = "full",
  onRefreshDay,
  refreshingDay,
  onReorderDay,
  reorderingDay,
  travelers = 2,
}: ItineraryViewProps) {
  const [activeDay, setActiveDay] = useState(0);
  const visitCount = itinerary.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "visit").length, 0);

  return (
    <div className="min-w-0 space-y-3 sm:space-y-5">
      {/* 摘要卡片 */}
      <div className="card-warm p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-warm-text truncate">
              {itinerary.cityInfo?.formattedAddress ?? itinerary.city}
            </h2>
            <p className="mt-1 text-sm text-warm-muted">{itinerary.days.length} 天 · {visitCount} 景点 · ¥{itinerary.totalCost}</p>
          </div>
          <div className="shrink-0 rounded-xl bg-warm-glow px-3 py-2 text-center">
            <p className="text-xl font-bold text-warm-600">{itinerary.optimizationScore}</p>
            <p className="text-[10px] text-warm-muted">评分</p>
          </div>
        </div>
        <details className="mt-3 sm:hidden">
          <summary className="text-xs text-warm-500">查看生成说明</summary>
          <p className="mt-2 text-xs leading-relaxed break-anywhere text-warm-muted">{itinerary.realtimeNote}</p>
        </details>
      </div>

      {mode === "full" && itinerary.budgetBreakdown && <BudgetSummary breakdown={itinerary.budgetBreakdown} />}

      {mode === "full" && (
        <TransportCompare
          trainRoutes={itinerary.trainRoutes}
          flightOption={itinerary.flightOption}
          busOption={itinerary.busOption}
          recommended={itinerary.recommendedTransport}
          routeDistanceKm={itinerary.routeDistanceKm}
          transportEvidence={itinerary.transportEvidence}
        />
      )}

      {mode === "full" && itinerary.topAttractions && itinerary.topAttractions.length > 0 && (
        <DestinationRankList city={itinerary.city} attractions={itinerary.topAttractions} />
      )}

      {/* 手机：按天 Tab */}
      <div className="sm:hidden">
        <div className="snap-scroll-x -mx-1 mb-3 px-1">
          {itinerary.days.map((day, i) => (
            <button
              key={day.day}
              type="button"
              onClick={() => setActiveDay(i)}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                activeDay === i
                  ? "bg-warm-500 text-white shadow-md"
                  : "border border-warm-200 bg-white text-warm-text"
              }`}
            >
              第{day.day}天
            </button>
          ))}
        </div>
        <div className="card-warm p-3">
          <DayContent
            day={itinerary.days[activeDay]}
            dayIndex={activeDay}
            onRefreshDay={onRefreshDay}
            refreshing={refreshingDay === activeDay}
            onReorderDay={onReorderDay}
            reordering={reorderingDay === activeDay}
            travelers={travelers}
          />
        </div>
      </div>

      {/* 桌面：全部展开 */}
      <div className="hidden space-y-4 sm:block">
        {itinerary.days.map((day, i) => (
          <section key={day.day} className="card-warm p-5">
            <DayContent
              day={day}
              dayIndex={i}
              onRefreshDay={onRefreshDay}
              refreshing={refreshingDay === i}
              onReorderDay={onReorderDay}
              reordering={reorderingDay === i}
              travelers={travelers}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
