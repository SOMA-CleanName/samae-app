/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { PhotographerCard } from "@/lib/discovery";
import { StarIcon, MapPinIcon } from "./icons";

// 작가 카드 (탐색 검색·찜 목록 공용)
export function PhotographerCardView({ p }: { p: PhotographerCard }) {
  const fmt = new Intl.NumberFormat("ko-KR");
  return (
    <Link
      href={`/photographers/${p.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="aspect-[4/3] overflow-hidden bg-fg/[0.05]">
        {p.cover_url ? (
          <img
            src={p.cover_url}
            alt={`${p.display_name || "작가"} 대표 작품`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
      </div>
      <div className="p-3 font-kr">
        <p className="text-sm font-semibold">{p.display_name || "작가"}</p>
        {p.bio && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{p.bio}</p>}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-fg/60">
          <span className="inline-flex items-center gap-0.5 text-amber-500">
            <StarIcon className="h-3.5 w-3.5" />
            <span className="font-medium text-fg/70">{p.rating_avg.toFixed(1)}</span>
          </span>
          <span className="text-fg/25">·</span>
          <span>₩{fmt.format(p.price_from_krw)}~</span>
          {p.regions[0] && (
            <>
              <span className="text-fg/25">·</span>
              <span className="inline-flex items-center gap-0.5">
                <MapPinIcon className="h-3.5 w-3.5 text-fg/45" />
                {p.regions[0]}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
