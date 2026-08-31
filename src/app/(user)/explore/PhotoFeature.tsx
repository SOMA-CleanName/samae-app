import Link from "next/link";
import type { FeaturedPhoto } from "@/lib/explore-db";

/**
 * 이번 호의 사진 — 잡지의 화보 페이지.
 *
 * 이 자리엔 '인기 사진' 레일도, 격자도, 잠깐은 '이번 호의 작가'도 있었다.
 * 형식은 이게 맞았고(전면 화보), 주인공만 사진으로 되돌렸다 —
 * **사매는 개별 작가를 띄우는 서비스가 아니다.** 작가를 스타로 만들면
 * 플랫폼이 아니라 그 사람의 채널이 된다.
 *
 * 그래서 이름도 가격도 안 싣는다. 대신 **어디서 찍혔는지**만 적는다.
 * 사진을 보고 "나도 여기서"가 되는 게 이 지면이 할 수 있는 일이다.
 * 누르면 사진 상세로 가고, 거기서 그 사진을 찍은 사람으로 이어진다.
 *
 * 형태는 위아래 섹션과 일부러 다르게 잡았다.
 *   위(아티클) — 넘겨 보는 카드 / 아래(장소) — 글 목록
 *   여기      — **한 장이 화면을 가득 채우는 전면 화보**
 * 지면을 내려오다 여기서 한 번 크게 숨이 트인다.
 */
export function PhotoFeature({ photos }: { photos: FeaturedPhoto[] }) {
  if (photos.length === 0) return null;

  return (
    <div className="space-y-10">
      {photos.map((p, i) => (
        <article key={p.id}>
          <Link
            href={`/photos/${p.id}`}
            className="pf group relative block overflow-hidden rounded-2xl bg-surface-2"
          >
            <span className="block aspect-[4/5] w-full sm:aspect-[16/9]">
              {/* 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img> */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.coverUrl}
                alt={p.location ? `${p.location}에서 촬영한 스냅 사진` : "스냅 사진"}
                loading={i === 0 ? undefined : "lazy"}
                className="pf-img h-full w-full object-cover"
              />
            </span>

            {/* 글이 앉는 아래쪽만 눌러 둔다. 위는 사진 그대로. */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent"
            />

            <span className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-5 sm:p-7">
              <span className="min-w-0 flex-1">
                <span aria-hidden className="mb-2.5 block h-[2px] w-6 bg-brand" />
                <span className="font-display text-[11px] italic tracking-wide text-white/70">
                  Photograph {String(i + 1).padStart(2, "0")}
                </span>
                {/* 촬영지 — 구체적으로 적힌 사진에만 있다. 없으면 이 줄이 통째로 빠진다. */}
                {p.location && (
                  <span className="mt-1 block truncate text-[clamp(1.35rem,6vw,2.1rem)] font-extrabold leading-[1.15] tracking-[-0.035em] text-white">
                    {p.location}
                  </span>
                )}
              </span>

              <span
                aria-hidden
                className="pf-go grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-fg"
              >
                →
              </span>
            </span>
          </Link>

          {/* 같은 촬영의 다른 컷 — 화보 아래 컨택트 시트처럼 한 줄 */}
          {p.moreUrls.length > 0 && (
            <ul className="mt-1.5 grid grid-cols-4 gap-1.5">
              {p.moreUrls.map((u, k) => (
                <li key={u} className="overflow-hidden rounded-md bg-surface-2">
                  <Link
                    href={`/photos/${p.id}`}
                    className="pf-cell block"
                    aria-label={`같은 촬영의 다른 컷 ${k + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt=""
                      loading="lazy"
                      className="pf-img aspect-square w-full object-cover"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
