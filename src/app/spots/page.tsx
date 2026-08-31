import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { StickyBack } from "@/components/editorial/StickyBack";
import { Masthead } from "@/components/editorial/Masthead";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { findSpot } from "@/lib/spots-data";
import { listSpotCards } from "@/lib/spots";

// 촬영 장소 목록.
//
// "성수 스냅 어디서 찍지" 류 질의는 지금 블로그가 다 가져간다. 소개글만으로는 이길 수 없고,
// 그 장소에서 **실제로 찍힌 사진**이 우리가 내밀 수 있는 유일한 차별점이다.
// 그런데 지면은 글자만 있는 목록이라 그 차별점이 화면에 하나도 안 보였다.
// 그래서 장소마다 그곳에서 찍힌 사진을 걸고, 장수를 옆에 붙인다.
//
// 지도에 핀을 꽂는 안도 있었지만 지금 Spot 데이터에 좌표가 없다(주소 문자열뿐).
// 좌표를 채우고 타일 제공자를 정하는 건 따로 결정할 일이라, 먼저 사진으로 간다.
//
// 사진이 0장인 장소는 싣지 않는다. 들어가 봐야 볼 게 없는 페이지를 색인시키면
// 품질 점수만 깎인다(탐색 카테고리에서 이미 겪었다).
export const revalidate = 86400;

export const metadata: Metadata = {
  // 전국으로 넓히는 중이라 제목에서 "서울"을 뗐다. 다만 지금 장소의 대부분이 서울이고
  // "서울 스냅 촬영 장소" 질의를 놓치면 안 돼서, 지면 안에서 지역 섹션(h2)으로 나눈다.
  title: "스냅 촬영 장소 — 서울·인천",
  description:
    "을지로·연남동 경의선숲길·창덕궁 등 서울과 인천 개항장 거리까지, 스냅 촬영 장소. 그곳에서 실제로 찍힌 사진과 찍는 작가, 대략의 비용까지 사매(samae)에서 확인하세요.",
  alternates: { canonical: "/spots" },
};

export default async function SpotsIndexPage() {
  // 카드(장수·대표 3장)는 탐색 탭과 같은 함수를 쓴다 — 두 지면이 다른 숫자를 말하면 안 된다.
  const cards = await listSpotCards(50);
  const spots = cards
    .map((c) => ({ card: c, spot: findSpot(c.slug) }))
    .filter((x): x is { card: (typeof cards)[number]; spot: NonNullable<ReturnType<typeof findSpot>> } => !!x.spot);

  const totalPhotos = spots.reduce((n, x) => n + x.card.count, 0);

  /*
    지역별로 묶는다.
    장소가 서울 밖으로 넓어지면서 한 줄로 이어 놓으면 "여기 서울 장소 맞나"가 안 보인다.
    사진이 많은 지역이 먼저 온다 — 지금은 서울이고, 다른 지역이 커지면 순서가 바뀐다.
  */
  const cities = [...new Set(spots.map((x) => x.spot.city))]
    .map((city) => ({
      city,
      items: spots.filter((x) => x.spot.city === city),
    }))
    .sort((a, b) => b.items.length - a.items.length);

  const list = itemListJsonLd(
    "서울 스냅 촬영 장소",
    spots.map(({ spot }) => ({ name: spot.name, path: `/spots/${spot.slug}` }))
  );
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: "촬영 장소", path: "/spots" },
  ]);

  return (
    <main className="min-h-dvh bg-bg font-kr">
      {list && <JsonLd data={list} />}
      <JsonLd data={breadcrumb} />

      <StickyBack href="/" meta="Locations" maxWidth="880px" />

      <div className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        <Masthead
          word="LOCATIONS"
          size="compact"
          lead="장소 소개만 있는 글은 많아요. 여기엔 그곳에서 실제로 찍힌 사진과, 그 사진을 찍은 작가가 같이 있어요."
          meta={
            spots.length > 0 ? (
              <span className="tabular-nums">
                장소 {spots.length}곳 · 사진 {totalPhotos}장
              </span>
            ) : undefined
          }
        />

        {spots.length === 0 ? (
          <p className="py-24 text-center text-body-sm text-muted">
            아직 공개된 장소가 없어요.
          </p>
        ) : (
          <div className="mt-8 space-y-10">
            {cities.map(({ city, items }) => (
              <section key={city}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-title font-bold tracking-tight">{city}</h2>
                  <span className="text-[11px] tabular-nums text-faint">{items.length}곳</span>
                </div>
                <ul className="mt-3 border-t border-line-strong">
            {items.map(({ spot, card: { count, covers } }, i) => (
              <li key={spot.slug} className="border-b border-line">
                <Link
                  href={`/spots/${spot.slug}`}
                  className="sp-row group grid grid-cols-[140px_minmax(0,1fr)] items-stretch gap-4 py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6 sm:py-6"
                >
                  {/*
                    사진 — 대표 1장 + 옆에 두 장. 장소마다 결이 다르다는 걸 글보다 빨리 말한다.
                    사진이 세 장이 안 되는 장소(경복궁 2장)에서는 옆 칸을 아예 안 만든다.
                    빈 회색 네모를 남기면 사진이 안 불러와진 것처럼 보인다.
                  */}
                  <span
                    className={
                      covers.length > 1
                        ? "grid grid-cols-[2fr_1fr] gap-1 overflow-hidden rounded-lg"
                        : "overflow-hidden rounded-lg"
                    }
                  >
                    {/*
                      비율은 2:3. 이 서비스 사진의 1/4 이 정확히 2:3 이고 중앙값도 0.71 이라
                      3:4(0.75) 박스에 object-cover 로 넣으면 위아래가 깎여 인물 다리가 잘렸다.
                      사진 쪽 비율에 박스를 맞추는 게 맞다.
                    */}
                    <span className="relative block aspect-[2/3] overflow-hidden bg-surface-2">
                      {covers[0] && (
                        // 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img>
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={covers[0]}
                          alt={`${spot.name}에서 촬영한 스냅 사진`}
                          loading={i < 2 ? undefined : "lazy"}
                          className="sp-img h-full w-full object-cover"
                        />
                      )}
                      <span
                        aria-hidden
                        // 흰 옷·밝은 하늘 위에서도 읽히게 그림자를 두 겹. 한 겹이면 흰 드레스 위에서 사라진다.
                        className="absolute left-1.5 top-1.5 font-display text-[11px] italic tabular-nums text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.75),0_0_10px_rgb(0_0_0/0.55)]"
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </span>
                    {covers.length > 1 && (
                      <span className="grid gap-1" style={{ gridTemplateRows: `repeat(${covers.length - 1}, minmax(0, 1fr))` }}>
                        {covers.slice(1, 3).map((u) => (
                          <span key={u} className="block overflow-hidden bg-surface-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt=""
                              loading="lazy"
                              className="sp-img h-full w-full object-cover"
                            />
                          </span>
                        ))}
                      </span>
                    )}
                  </span>

                  {/* 글 */}
                  <span className="flex min-w-0 flex-col justify-center">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
                        {spot.area}
                      </span>
                      {spot.station && (
                        <span className="min-w-0 truncate text-[11px] text-faint">
                          {spot.station}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex items-baseline gap-2">
                      <span className="text-title font-bold tracking-tight transition-colors group-hover:text-brand">
                        {spot.name}
                      </span>
                      <span className="sp-arrow shrink-0 text-body-sm text-faint">→</span>
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-body-sm leading-relaxed text-muted sm:line-clamp-3">
                      {spot.desc}
                    </span>
                    {/* 우리만 붙일 수 있는 사실 — 이게 이 목록의 존재 이유다 */}
                    <span className="mt-2.5 inline-flex w-fit items-baseline gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold tabular-nums text-brand-ink">
                      여기서 찍힌 사진 {count}장
                    </span>
                  </span>
                </Link>
              </li>
            ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-8 text-[11px] leading-relaxed text-faint">
          장소 정보는 확인된 것만 올려요. 확인 중인 곳은 준비되는 대로 추가됩니다.
        </p>
      </div>
    </main>
  );
}
