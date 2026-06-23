import EvidencePanel from "@/components/EvidencePanel";
import BudgetSummary from "@/components/BudgetSummary";
import TransportCompare from "@/components/TransportCompare";
import DestinationRankList from "@/components/DestinationRankList";
import type { Itinerary, POI, TimelineItem } from "@/lib/types";
import { valueRankLabel } from "@/lib/realtime-engine";
import { transportIcon, transportLabel } from "@/lib/transport";
import { weatherIcon, weatherLabel } from "@/lib/weather";

interface ItineraryViewProps {
  itinerary: Itinerary;
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
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {item.poi.links.map((link, i) => (
        <a
          key={`${link.platform}-${i}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`touch-target flex items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium transition active:opacity-80 sm:inline-flex sm:py-1.5 ${PLATFORM_COLORS[link.platform] ?? "bg-warm-50 text-warm-text border-warm-200"}`}
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
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {poi.links.map((link, i) => (
        <a
          key={`${link.platform}-${i}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`touch-target flex items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium active:opacity-80 sm:inline-flex sm:py-1.5 ${PLATFORM_COLORS[link.platform] ?? "bg-warm-50 border-warm-200 text-warm-text"}`}
        >
          {link.label} · {link.action} →
        </a>
      ))}
    </div>
  );
}

function DealCards({ item }: { item: TimelineItem }) {
  if (!item.poi?.deals?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-warm-muted">参考价格（以平台实时为准）</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {item.poi.deals.map((deal, i) => (
          <a
            key={`${deal.platform}-${i}`}
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-xs active:border-warm-400"
          >
            <span className="font-medium text-warm-text">{deal.platform} · {deal.label}</span>
            <span className="font-bold tabular-nums text-warm-600">¥{deal.dealPrice}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function POIPhotos({ poi }: { poi: POI }) {
  const photos = poi.photoUrls?.length ? poi.photoUrls : poi.photoUrl ? [poi.photoUrl] : [];
  if (photos.length === 0) {
    return (
      <div className="mt-3 flex h-28 items-center justify-center rounded-xl bg-warm-100 text-xs text-warm-muted">
        暂无实拍图 · 点击高德详情查看
      </div>
    );
  }
  return (
    <div className={`mt-3 grid gap-1.5 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {photos.map((url, i) => (
        <a
          key={url}
          href={poi.links?.find((l) => l.platform === "amap" && l.action.includes("详情"))?.url ?? url}
          target="_blank"
          rel="noopener noreferrer"
          className={`overflow-hidden rounded-xl bg-warm-100 ${i === 0 && photos.length > 1 ? "row-span-2" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${poi.name} 实拍${i + 1}`}
            className={`h-full w-full object-cover ${photos.length === 1 ? "max-h-52 sm:max-h-48" : "h-28 sm:h-24"}`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
      ))}
      <p className="col-span-full text-[10px] text-warm-muted">实拍来源：高德地图 · 点击可查看详情</p>
    </div>
  );
}

function POIReviewBar({ poi }: { poi: POI }) {
  const reviews = poi.reviewCount >= 1000 ? `${(poi.reviewCount / 1000).toFixed(1)}k` : poi.reviewCount;
  return (
    <p className="mt-1 text-xs text-warm-muted">
      ★ {poi.compositeRating ?? poi.rating} 分
      {poi.reviewCount > 0 && <span> · 约 {reviews} 条高德评价</span>}
      {poi.pricePerPerson > 0 && poi.type === "restaurant" && (
        <span className="ml-1 text-warm-text"> · 人均 ¥{poi.pricePerPerson}</span>
      )}
    </p>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  if (item.kind === "transport" && item.transport) {
    const t = item.transport;
    return (
      <div className="flex gap-2.5 pb-3 sm:gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warm-200 text-xs">
          {transportIcon(t.mode)}
        </div>
        <div className="min-w-0 flex-1 rounded-xl bg-warm-100 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-warm-text">{transportLabel(t.mode)}</span>
            <span className="tabular-nums text-warm-muted">{item.startTime} - {item.endTime}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-warm-muted">
            {t.from} → {t.to} · {t.distanceKm} km · 约 {t.durationMinutes} 分钟
            {t.cost > 0 && ` · ¥${t.cost}`}
          </p>
          {item.note && <p className="mt-1 text-xs text-warm-600">{item.note}</p>}
        </div>
      </div>
    );
  }

  if (!item.poi) return null;
  const poi = item.poi;
  const rt = item.realtime;

  return (
    <div className="flex gap-2.5 pb-4 sm:gap-3 sm:pb-5">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-warm-400 to-warm-500 text-[10px] font-semibold text-white shadow-sm">
        {item.kind === "meal" ? "餐" : "游"}
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-warm-200 bg-white p-3 shadow-sm sm:p-4">
        <POIPhotos poi={poi} />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-warm-text">{poi.name}</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-warm-100 px-2 py-0.5 text-xs text-warm-muted">
                {item.kind === "meal" ? "餐饮" : "景点"}
              </span>
              {poi.authorityTag && (
                <span className="rounded-lg bg-warm-glow px-2 py-0.5 text-xs font-medium text-warm-700">
                  文旅部 {poi.authorityTag}
                </span>
              )}
              {poi.signature && (
                <span className="rounded-lg bg-warm-100 px-2 py-0.5 text-xs text-warm-muted">{poi.signature}</span>
              )}
              {rt?.valueRank === "high" && (
                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {valueRankLabel(rt.valueRank)}
                </span>
              )}
            </div>
            <POIReviewBar poi={poi} />
          </div>
          <div className="shrink-0 self-start">
            <span className="inline-flex rounded-xl bg-gradient-to-br from-warm-accent/20 to-warm-glow px-3 py-1.5 text-sm font-bold tabular-nums text-warm-700 ring-1 ring-warm-accent/30">
              ★ {poi.compositeRating ?? poi.rating}
            </span>
          </div>
        </div>

        <div className="mt-2 grid gap-1 text-sm text-warm-muted">
          <p className="tabular-nums">{item.startTime} - {item.endTime} · 停留约 {poi.durationMinutes} 分钟</p>
          {poi.openTime && <p>营业 {poi.openTime} - {poi.closeTime}</p>}
          {poi.address && <p className="text-xs leading-relaxed">{poi.address}</p>}
          {poi.cost > 0 && (
            <p className="tabular-nums text-warm-text">
              参考花费 ¥{poi.cost}（2人）
              {poi.priceNote && <span className="ml-1 text-xs text-warm-muted">· {poi.priceNote}</span>}
            </p>
          )}
        </div>

        {rt && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-warm-glow px-2.5 py-0.5 text-xs font-semibold text-warm-700">
              综合 {rt.score}
            </span>
            {rt.scoreReasons.slice(0, 4).map((r) => (
              <span key={r} className="rounded-full bg-warm-100 px-2.5 py-0.5 text-xs text-warm-muted">{r}</span>
            ))}
          </div>
        )}

        {item.note && <p className="mt-2 text-xs text-warm-600">{item.note}</p>}

        {item.alternatives && item.alternatives.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-warm-300 bg-warm-50 p-3">
            <p className="text-xs font-medium text-warm-muted">备选 {item.alternatives.length} 个</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.alternatives.map((alt) => (
                <a
                  key={alt.id}
                  href={alt.links?.[0]?.url ?? `https://uri.amap.com/marker?position=${alt.lng},${alt.lat}&name=${encodeURIComponent(alt.name)}&coordinate=gaode&callnative=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-warm-200 bg-white px-2.5 py-2 text-xs active:border-warm-400"
                >
                  <span className="font-medium">{alt.name}</span>
                  <span className="text-warm-accent">★{alt.rating}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {item.evidence && item.evidence.length > 0 && (
          <div className="mt-3"><EvidencePanel evidence={item.evidence} compact /></div>
        )}

        <DealCards item={item} />
        <PlatformButtons item={item} />
      </div>
    </div>
  );
}

export default function ItineraryView({ itinerary }: ItineraryViewProps) {
  const visitCount = itinerary.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "visit").length, 0);
  const mealCount = itinerary.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "meal").length, 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="card-warm p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-warm-text sm:text-xl">
              {itinerary.cityInfo?.formattedAddress ?? itinerary.city} · {itinerary.days.length} 日
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-warm-muted">{itinerary.realtimeNote}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {itinerary.dataSources.map((s) => (
                <span key={s} className="rounded-lg bg-warm-100 px-2 py-0.5 text-[10px] text-warm-muted">{s}</span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 self-start rounded-xl border border-warm-300 bg-warm-glow px-4 py-2.5 sm:block sm:text-center">
            <p className="text-2xl font-bold tabular-nums text-warm-600">{itinerary.optimizationScore}</p>
            <p className="text-[10px] text-warm-muted sm:mt-0">行程评分</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:flex sm:flex-wrap sm:gap-4 sm:text-left">
          <div className="rounded-xl bg-warm-100 px-2 py-2 sm:bg-transparent sm:p-0">
            <p className="text-xs text-warm-muted sm:hidden">总预算</p>
            <p className="text-sm font-semibold tabular-nums text-warm-text sm:font-normal">¥{itinerary.totalCost}</p>
          </div>
          <div className="rounded-xl bg-warm-100 px-2 py-2 sm:bg-transparent sm:p-0">
            <p className="text-xs text-warm-muted sm:hidden">景点</p>
            <p className="text-sm font-semibold text-warm-text sm:font-normal">{visitCount} 景点</p>
          </div>
          <div className="rounded-xl bg-warm-100 px-2 py-2 sm:bg-transparent sm:p-0">
            <p className="text-xs text-warm-muted sm:hidden">餐饮</p>
            <p className="text-sm font-semibold text-warm-text sm:font-normal">{mealCount} 餐</p>
          </div>
        </div>
      </div>

      {itinerary.budgetBreakdown && <BudgetSummary breakdown={itinerary.budgetBreakdown} />}

      <TransportCompare
        trainRoutes={itinerary.trainRoutes}
        flightOption={itinerary.flightOption}
        busOption={itinerary.busOption}
        recommended={itinerary.recommendedTransport}
        routeDistanceKm={itinerary.routeDistanceKm}
        transportEvidence={itinerary.transportEvidence}
      />

      {itinerary.topAttractions && itinerary.topAttractions.length > 0 && (
        <DestinationRankList city={itinerary.city} attractions={itinerary.topAttractions} />
      )}

      {itinerary.days.map((day) => (
        <section key={day.day} className="card-warm p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 border-b border-warm-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-warm-text sm:text-lg">
                第 {day.day} 天 <span className="text-sm font-normal tabular-nums text-warm-muted">{day.date}</span>
              </h3>
              <p className="mt-0.5 text-xs text-warm-muted sm:text-sm">{day.summary}</p>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-xl bg-warm-100 px-3 py-2 text-sm">
              {weatherIcon(day.weather.condition)} {weatherLabel(day.weather.condition)}
              <span className="tabular-nums text-warm-text">{day.weather.tempLow}°~{day.weather.tempHigh}°C</span>
            </div>
          </div>

          {day.items.map((item, idx) => (
            <TimelineEntry key={`${day.day}-${idx}-${item.poi?.id ?? item.transport?.mode}`} item={item} />
          ))}

          <div className="mt-2 flex flex-wrap gap-3 border-t border-warm-200 pt-3 text-xs text-warm-muted sm:gap-4">
            <span className="tabular-nums">路程约 {day.totalDistance} km</span>
            <span className="tabular-nums">花费约 ¥{day.totalCost}</span>
          </div>

          {day.hotel && (
            <div className="mt-4 rounded-xl border border-warm-300 bg-warm-glow/40 p-3 sm:p-4">
              <p className="text-xs font-medium text-warm-700">当晚住宿 · 距最后一站最近 · 连锁/舒适型优先</p>
              <POIPhotos poi={day.hotel} />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-semibold text-warm-text">{day.hotel.name}</span>
                  <POIReviewBar poi={day.hotel} />
                </div>
                <span className="text-sm font-bold tabular-nums text-warm-600">
                  ¥{day.hotel.pricePerPerson}/晚
                  <span className="ml-1 text-[10px] font-normal text-warm-muted">整间参考价</span>
                </span>
              </div>
              {day.hotel.address && <p className="mt-1 text-xs text-warm-muted">{day.hotel.address}</p>}
              <POILinks poi={day.hotel} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
