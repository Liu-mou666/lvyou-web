import type { RankedAttraction } from "@/lib/types";

interface DestinationRankListProps {
  city: string;
  attractions: RankedAttraction[];
}

function RankCard({ item }: { item: RankedAttraction }) {
  const url = item.poi.photoUrls?.[0] ?? item.poi.photoUrl;
  const amapLink = item.poi.links?.find((l) => l.platform === "amap" && l.action.includes("详情"));
  const ctripLink = item.poi.links?.find((l) => l.platform === "ctrip");
  const dpLink = item.poi.links?.find((l) => l.platform === "dianping");

  return (
    <article className="overflow-hidden rounded-2xl border border-warm-200 bg-white shadow-sm">
      <div className="flex gap-3 p-3 sm:block sm:p-0">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl sm:h-36 sm:w-full sm:rounded-none">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={item.poi.name} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full items-center justify-center bg-warm-100 text-xs text-warm-muted">暂无图</div>
          )}
          <span className="absolute left-2 top-2 rounded-lg bg-warm-500 px-2 py-0.5 text-xs font-bold text-white">#{item.rank}</span>
          <span className="absolute right-2 top-2 rounded-lg bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">{item.score}分</span>
        </div>

        <div className="min-w-0 flex-1 sm:p-3">
          <h4 className="text-sm font-bold leading-snug text-warm-text break-anywhere">{item.poi.name}</h4>
          <p className="mt-1 text-xs text-warm-accent">★ {item.poi.compositeRating ?? item.poi.rating}</p>

          {item.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {item.reasons.slice(0, 4).map((r) => (
                <li key={r} className="text-[11px] leading-relaxed text-warm-muted before:mr-1 before:text-warm-400 before:content-['·']">
                  {r}
                </li>
              ))}
            </ul>
          )}

          {item.poi.priceNote && (
            <p className="mt-2 text-[10px] leading-relaxed text-warm-muted">{item.poi.priceNote}</p>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {amapLink && (
              <a href={amapLink.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-warm-600">
                高德 →
              </a>
            )}
            {ctripLink && (
              <a href={ctripLink.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-sky-600">
                携程 →
              </a>
            )}
            {dpLink && (
              <a href={dpLink.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-orange-600">
                点评 →
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function DestinationRankList({ city, attractions }: DestinationRankListProps) {
  if (!attractions.length) return null;

  return (
    <section className="card-warm overflow-hidden">
      <div className="border-b border-warm-200 bg-warm-100/50 px-4 py-3">
        <h3 className="text-sm font-bold text-warm-text">{city} 必去榜 TOP{attractions.length}</h3>
        <p className="mt-0.5 text-[11px] text-warm-muted">按评分、权威名录、主题匹配与性价比综合排序</p>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
        {attractions.map((item) => (
          <RankCard key={item.poi.id} item={item} />
        ))}
      </div>
    </section>
  );
}
