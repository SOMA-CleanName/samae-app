import Link from "next/link";
import type { SpotCard } from "@/lib/spots";

/**
 * 촬영 장소 레일.
 *
 * 참고한 건 Ibiza 티켓 카드다 — 사진 아래 점선 절취선, 그 밑에 필드로 박힌 정보.
 * 장소 페이지가 블로그와 갈리는 지점이 "여기서 찍힌 사진이 몇 장 있냐"라서,
 * 그 숫자를 감성 문구가 아니라 **입장권의 필드처럼** 박아 둔다.
 */
export function SpotsRail({ spots }: { spots: SpotCard[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-3">
        {spots.map((s) => (
          <li key={s.slug} className="w-[228px] shrink-0">
            <Link
              href={`/spots/${s.slug}`}
              className="ed-cell group block overflow-hidden rounded-lg border border-line bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.coverUrl as string}
                alt={`${s.name}에서 촬영한 스냅`}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />

              {/* 절취선 — 양옆이 안으로 파인 티켓 모양 */}
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-bg"
                />
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-bg"
                />
                <span
                  aria-hidden
                  className="block border-t border-dashed border-line-strong"
                />
              </div>

              <div className="p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                  {s.area}
                </p>
                <p className="mt-1 text-body font-bold tracking-tight transition-colors group-hover:text-brand">
                  {s.name}
                </p>

                <dl className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5 text-[11px]">
                  <dt className="uppercase tracking-[0.12em] text-faint">여기서 찍힌 사진</dt>
                  <dd className="font-bold tabular-nums">{s.count}</dd>
                </dl>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
