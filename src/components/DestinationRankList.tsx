import type { RankedAttraction } from "@/lib/types";

interface DestinationRankListProps {
  city: string;
  attractions: RankedAttraction[];
}

function RankCard({ item }: { item: RankedAttraction }) {
  const url = item.poi.photoUrls?.[0] ?? item.poi.photoUrl;

  return (
    <article className="w-[78vw] max-w-[300px] overflow-hidden rounded-2xl border border-warm-200 bg-white shadow-sm sm:w-auto sm:max-w-none">
      <div className="relative h-36 overflow-hidden sm:h-32">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.poi.name} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-center justify-center bg-warm-100 text-xs text-warm-muted">暂无图</div>
        )}
        <span className="absolute left-2 top-2 rounded-lg bg-warm-500 px-2 py-0.5 text-xs font-bold text-white">#{item.rank}</span>
        <span className="absolute right-2 top-2 rounded-lg bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">{item.score}分</span>
      </div>
      <div className="p-3">
        <h4 className="line-clamp-2 text-sm font-bold leading-snug text-warm-text">{item.poi.name}</h4>
        <p className="mt-1 text-xs text-warm-accent">★ {item.poi.compositeRating ?? item.poi.rating}</p>
        {item.poi.links?.[0] && (
          <a
            href={item.poi.links.find((l) => l.platform === "amap")?.url ?? item.poi.links[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex min-h-[40px] items-center text-xs font-medium text-warm-600"
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
      <div className="border-b border-warm-200 bg-warm-100/50 px-4 py-3">
        <h3 className="text-sm font-bold text-warm-text">{city} 必去榜 TOP{attractions.length}</h3>
        <p className="mt-0.5 text-[11px] text-warm-muted">左右滑动查看更多</p>
      </div>
      <div className="snap-scroll-x p-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:p-4 lg:grid-cols-3">
        {attractions.map((item) => (
          <RankCard key={item.poi.id} item={item} />
        ))}
      </div>
    </section>
  );
}
