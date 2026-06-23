import type { RankedAttraction } from "@/lib/types";

interface DestinationRankListProps {
  city: string;
  attractions: RankedAttraction[];
}

function RankCard({ item }: { item: RankedAttraction }) {
  const url = item.poi.photoUrls?.[0] ?? item.poi.photoUrl;

  return (
    <article className="w-[72vw] max-w-[280px] overflow-hidden rounded-xl border border-warm-200 bg-white shadow-sm sm:w-auto sm:max-w-none">
      <div className="relative h-32 overflow-hidden sm:h-28">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={item.poi.name}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-warm-100 text-xs text-warm-muted">暂无图</div>
        )}
        <span className="absolute left-2 top-2 rounded-lg bg-gradient-to-r from-warm-400 to-warm-500 px-2 py-0.5 text-xs font-bold text-white shadow">
          #{item.rank}
        </span>
        <span className="absolute right-2 top-2 rounded-lg bg-black/50 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          {item.score} 分
        </span>
      </div>
      <div className="p-3">
        <h4 className="line-clamp-1 font-semibold text-warm-text">{item.poi.name}</h4>
        <p className="mt-1 text-xs text-warm-accent">
          ★ {item.poi.compositeRating ?? item.poi.rating}
          {item.poi.authorityTag && (
            <span className="ml-1 rounded bg-warm-glow px-1.5 py-0.5 text-warm-700">{item.poi.authorityTag}</span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {item.reasons.slice(0, 2).map((r) => (
            <span key={r} className="rounded bg-warm-100 px-1.5 py-0.5 text-[10px] text-warm-muted">
              {r}
            </span>
          ))}
        </div>
        {item.poi.links?.[0] && (
          <a
            href={item.poi.links.find((l) => l.platform === "amap")?.url ?? item.poi.links[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs font-medium text-warm-600 active:text-warm-500"
          >
            高德详情 →
          </a>
        )}
      </div>
    </article>
  );
}

export default function DestinationRankList({ city, attractions }: DestinationRankListProps) {
  if (!attractions.length) return null;

  return (
    <section className="card-warm overflow-hidden">
      <div className="border-b border-warm-200 bg-warm-100/50 px-4 py-3.5 sm:px-5 sm:py-4">
        <h3 className="text-base font-semibold text-warm-text">{city} · 必去榜 TOP {attractions.length}</h3>
        <p className="mt-1 text-xs text-warm-muted">
          融合高德评分、文旅部 5A 名录、主题匹配与性价比 · 含实拍图
        </p>
      </div>

      {/* 手机：横向滑动；平板/桌面：网格 */}
      <div className="snap-scroll-x p-4 sm:hidden">
        {attractions.map((item) => (
          <RankCard key={item.poi.id} item={item} />
        ))}
      </div>
      <div className="hidden gap-3 p-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {attractions.map((item) => (
          <RankCard key={item.poi.id} item={item} />
        ))}
      </div>
    </section>
  );
}
