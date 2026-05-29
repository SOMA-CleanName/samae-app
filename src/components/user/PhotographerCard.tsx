/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { PhotographerCard } from "@/lib/discovery";

// 작가 카드 (탐색 검색·찜 목록 공용)
export function PhotographerCardView({ p }: { p: PhotographerCard }) {
  const fmt = new Intl.NumberFormat("ko-KR");
  return (
    <Link
      href={`/photographers/${p.handle}`}
      className="overflow-hidden rounded-xl border border-fg/10 transition-colors hover:border-fg/25"
    >
      <div className="aspect-[4/3] bg-fg/[0.05]">
        {p.cover_url ? (
          <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="p-3 font-kr">
        <p className="text-sm font-semibold">{p.display_name || `@${p.handle}`}</p>
        {p.bio && <p className="mt-0.5 line-clamp-1 text-xs text-fg/55">{p.bio}</p>}
        <div className="mt-1.5 flex items-center gap-2 text-xs text-fg/60">
          <span className="text-amber-500">★ {p.rating_avg.toFixed(1)}</span>
          <span className="text-fg/25">·</span>
          <span>₩{fmt.format(p.price_from_krw)}~</span>
          {p.regions[0] && (
            <>
              <span className="text-fg/25">·</span>
              <span>📍{p.regions[0]}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
