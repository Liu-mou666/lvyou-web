import EvidencePanel from "@/components/EvidencePanel";
import type { Evidence, TrainRoute } from "@/lib/types";

interface TransportCompareProps {
  trainRoutes?: TrainRoute[];
  flightOption?: TrainRoute;
  busOption?: TrainRoute;
  recommended?: string;
  routeDistanceKm?: number;
  transportEvidence?: Evidence[];
}

function LegBookings({ route }: { route: TrainRoute }) {
  if (route.type !== "transfer" || route.legs.length < 2) return null;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-warm-200 bg-warm-glow/60 p-3">
      <p className="text-xs font-medium text-warm-700">分段查票（携程/12306 各段独立搜索）</p>
      {route.legs.map((leg, i) => (
        <div key={`${leg.from}-${leg.to}`} className="rounded-xl border border-warm-200 bg-white p-2.5 sm:p-3">
          <p className="text-xs font-semibold text-warm-text">
            第 {i + 1} 段 · {leg.from} → {leg.to}
            <span className="mt-0.5 block font-normal text-warm-muted sm:ml-2 sm:mt-0 sm:inline">
              {Math.round(leg.durationHours * 10) / 10}h · ¥{leg.price}（2人二等座合计）
            </span>
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {leg.bookingLinks?.map((link, j) => (
              <a
                key={j}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="touch-target flex items-center justify-center rounded-xl border border-warm-300 bg-warm-50 px-3 py-2.5 text-xs font-medium text-warm-700 active:bg-warm-100 sm:inline-flex sm:py-1.5"
              >
                {link.label} · {link.action} →
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-warm-muted">无直达时携程会显示中转方案；也可逐段点击上方按钮分别查询。</p>
    </div>
  );
}

function RouteRow({ route, variant }: { route: TrainRoute; variant: "train" | "flight" | "bus" }) {
  const badge =
    variant === "flight" ? "飞机" : variant === "bus" ? "汽车" : route.type === "transfer" ? "中转" : "直达";

  return (
    <div
      className={`rounded-xl border p-3 transition sm:p-4 ${
        route.recommended
          ? "border-warm-500 bg-warm-glow/50 ring-1 ring-warm-400/25 shadow-sm shadow-warm-500/10"
          : "border-warm-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-muted">
              {badge}
            </span>
            <h4 className="text-sm font-semibold text-warm-text sm:text-base">{route.title}</h4>
            {route.recommended && (
              <span className="rounded-full bg-gradient-to-r from-warm-400 to-warm-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                推荐
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-warm-muted sm:text-sm">{route.description}</p>
          {route.trainNumbers && route.trainNumbers.length > 0 && (
            <p className="mt-1 text-xs text-warm-600">车次：{route.trainNumbers.join("、")}</p>
          )}
          {route.dataSource && (
            <p className="mt-1 text-[10px] text-warm-muted/80">数据来源：{route.dataSource}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-warm-100 px-3 py-2 sm:block sm:bg-transparent sm:p-0 sm:text-right">
          <div>
            <p className="text-xl font-bold tabular-nums text-warm-600">¥{route.totalPrice}</p>
            <p className="text-[10px] text-warm-muted">2人二等座合计</p>
          </div>
          <div className="text-right sm:mt-1">
            <p className="text-sm font-medium tabular-nums text-warm-text">{route.totalHours}h</p>
            {route.departTime && route.arriveTime && (
              <p className="text-xs tabular-nums text-warm-muted">{route.departTime} → {route.arriveTime}</p>
            )}
          </div>
        </div>
      </div>

      <LegBookings route={route} />

      {route.type === "direct" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {route.links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target flex items-center justify-center rounded-xl border border-warm-200 bg-white px-3 py-2.5 text-xs font-medium text-warm-text active:border-warm-400 sm:inline-flex sm:py-1.5"
            >
              {link.label} · {link.action} →
            </a>
          ))}
        </div>
      )}

      {route.evidence && route.evidence.length > 0 && (
        <div className="mt-3">
          <EvidencePanel evidence={route.evidence} compact />
        </div>
      )}
    </div>
  );
}

export default function TransportCompare({
  trainRoutes,
  flightOption,
  busOption,
  recommended,
  routeDistanceKm,
  transportEvidence,
}: TransportCompareProps) {
  if (!trainRoutes?.length && !flightOption && !busOption) return null;

  return (
    <section className="card-warm overflow-hidden">
      <div className="border-b border-warm-200 bg-warm-100/50 px-4 py-3.5 sm:px-5 sm:py-4">
        <h3 className="text-base font-semibold text-warm-text">去程交通对比</h3>
        <p className="mt-1 text-xs leading-relaxed text-warm-muted">
          基于全国铁路站码库{trainRoutes?.[0]?.trainNumbers?.length ? " + 12306 车次查询" : ""}
          {routeDistanceKm ? ` · 直线约 ${routeDistanceKm} km` : ""}
          {recommended ? ` · 推荐：${recommended}` : ""}
        </p>
      </div>

      <div className="space-y-3 p-3 sm:p-5">
        {trainRoutes?.map((r) => <RouteRow key={r.id} route={r} variant="train" />)}
        {flightOption && <RouteRow route={flightOption} variant="flight" />}
        {busOption && <RouteRow route={busOption} variant="bus" />}
      </div>

      {transportEvidence && transportEvidence.length > 0 && (
        <div className="border-t border-warm-200 px-4 py-3 sm:px-5">
          <EvidencePanel evidence={transportEvidence} compact />
        </div>
      )}
    </section>
  );
}
