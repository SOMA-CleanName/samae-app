import Link from "next/link";
import Image from "next/image";
import type { PhotographerCard } from "@/lib/discovery";
import { MapPinIcon } from "./icons";

// 작가 카드 (탐색 검색·찜 목록 공용)
export function PhotographerCardView({ p }: { p: PhotographerCard }) {
  const fmt = new Intl.NumberFormat("ko-KR");
  return (
    <Link
      href={`/photographers/${p.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-fg/[0.05]">
        {p.cover_url ? (
          <Image
            src={p.cover_url}
            alt="사진작가 대표 작품"
            fill
            sizes="(max-width: 768px) 50vw, 320px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
      </div>
      <div className="p-3 font-kr">
        <p className="text-sm font-semibold">사진작가</p>
        {p.bio && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{p.bio}</p>}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-fg/60">
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
