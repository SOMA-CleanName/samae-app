import Link from "next/link";
import { cookies } from "next/headers";
import {
  listPublishedExploreSections,
  rankExploreCategoriesByPopularity,
  listPopularPosts,
} from "@/lib/explore-db";
import { getPublishedCategory } from "@/lib/categories";
import { loadCurationSlides, loadMoodItemsForTarget } from "@/lib/target-categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { memoTtl } from "@/lib/server-memo";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { MovingCoverCarousel, type CoverCat } from "./MovingCoverCarousel";
import { CategoryGrid, type GridItem } from "./CategoryGrid";
import { RecentSnapsRail } from "./RecentSnapsRail";
import { TasteTestCard } from "./TasteTestCard";
import { PersonaTestCard } from "./PersonaTestCard";
import { LiveViewers } from "./LiveViewers";
import { ExploreTabBar, type ExploreTab } from "./ExploreTabBar";
import { ArticleRail } from "./ArticleRail";
import { listPublishedArticles } from "@/lib/articles";

export const dynamic = "force-dynamic";

// 탐색 페이지 — 타겟 카테고리(촬영 종류) 기준으로 오늘의 큐레이션 + 추천 무드를 노출.
//  · 오늘의 큐레이션 = 타겟당 운영자가 지정한 3장 (내 타겟만, 컨텍스트 없으면 전체 순환)
//  · 추천 무드      = 그 타겟에 연결된 탐색 카테고리 + 타겟별 대표 사진
// 내 타겟은 광고 진입(/c/<slug>) 시 심기는 samae_cat 쿠키로 판별한다.
// ?focus=taste 로 들어오면 취향 테스트 섹션을 강조·스크롤한다.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  const adSlug = (await cookies()).get(CATEGORY_COOKIE)?.value;
  const adCat = adSlug ? await getPublishedCategory(adSlug) : null;

  // 세 로더는 서로 독립인데 순차 await 로 돌아 TTFB 1.8~2.2s 를 만들고 있었다(실측).
  // 병렬화 + 60s 인메모리 메모 — 이 데이터는 운영자 큐레이션·일간 랭킹이라
  // 요청마다 다시 계산할 이유가 없다. (개인화 없음 — 키는 광고 타겟뿐)
  const ctx = adCat?.id ?? "all";
  // 아티클은 개인화가 없고 자주 바뀌지 않아 60초 메모로 충분하다.
  const articlesPromise = memoTtl("explore:articles", 60_000, () => listPublishedArticles());

  const [coverCats, gridItems, popular]: [CoverCat[], GridItem[], Awaited<ReturnType<typeof listPopularPosts>>] =
    await Promise.all([
      // 오늘의 큐레이션 — 이번 세션의 타겟에 속한 무드들(슬라이드 1개 = 무드 1개, 3컷)
      memoTtl(`explore:cover:${ctx}`, 60_000, () => loadCurationSlides(adCat?.id ?? null)),

      // 추천 무드 — 내 타겟에 연결된 무드. 타겟이 없으면 전체 공개 무드를 인기순으로
      memoTtl(`explore:grid:${ctx}`, 60_000, async () =>
        adCat
          ? loadMoodItemsForTarget(adCat.id)
          : (await listPublishedExploreSections(10, await rankExploreCategoriesByPopularity()))
              .filter((s) => s.photos.length >= 1)
              .map((s) => ({
                slug: s.category.slug,
                title: s.category.title,
                subtitle: s.category.subtitle,
                // 미리보기 지정 1번 → 담긴 첫 장 (요청마다 바뀌지 않게 고정)
                url: s.photos[0].src_url,
              }))
      ),

      // 사매 인기 스냅 — 광고 유입이면 그 범위, 비면 전역 폴백(섹션이 비지 않게)
      memoTtl(`explore:popular:${ctx}`, 60_000, async () => {
        const scoped = await listPopularPosts(24, 1, adCat?.exploreSectionIds);
        if (adCat?.exploreSectionIds?.length && scoped.length === 0) return listPopularPosts(24, 1);
        return scoped;
      }),
    ]);

  const articles = await articlesPromise;

  // 중간 메뉴바 탭 — 실제로 렌더되는 섹션만(스크롤 이동 대상).
  const tabs: ExploreTab[] = [
    { id: "sec-taste", label: "내 취향 테스트" },
    { id: "sec-persona", label: "촬영 페르소나" },
    { id: "sec-hot", label: "추천 무드" },
    ...(popular.length > 0 ? [{ id: "sec-recent", label: "사매 인기 스냅" }] : []),
  ];

  return (
    <section className="font-kr">
      <MpTrackOnce
        event="View Explore Feed"
        props={{ mood_count: gridItems.length, target: adCat?.slug ?? null }}
      />
      <ScrollMemory
        targetId={focus === "taste" ? "sec-taste" : undefined}
        targetViewportTop={focus === "taste" ? 96 : 0}
        targetBlock={focus === "taste" ? "center" : "start"}
        animateTarget={focus === "taste"}
      />

      <div className="mx-auto w-full max-w-4xl px-2.5 pb-4 pt-3 sm:px-4 sm:pt-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="text-2xl font-bold tracking-tight">오늘의 큐레이션</h1>
          {coverCats.length > 0 && <LiveViewers />}
        </div>

        {coverCats.length === 0 && gridItems.length === 0 ? (
          <p className="py-16 text-center text-body-sm text-muted">
            준비 중이에요. 곧 큐레이션한 카테고리를 보여드릴게요.
          </p>
        ) : (
          <>
            {/* 무빙 커버 캐러셀 — 데스크톱에선 세로 히어로가 거대해지지 않게 중앙 캡 */}
            {coverCats.length > 0 && (
              <div className="mx-auto w-full max-w-md">
                <MovingCoverCarousel cats={coverCats} />
              </div>
            )}

            {/* 중간 메뉴바 — 커버(히어로) 아래. 스크롤하면 상단 고정 + '사매' 헤더 노출.
                (sticky 가 섹션 전체 구간 동안 고정되려면 래퍼로 감싸지 말 것) */}
            <ExploreTabBar tabs={tabs} />

            {/* 취향 테스트 (진입 CTA) — 메뉴바 바로 아래 첫 섹션 */}
            <div id="sec-taste" data-pid="sec-taste" className="mt-6 scroll-mt-24">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">01</span>
                <h2 className="text-title font-bold tracking-tight">내 취향 테스트</h2>
              </div>
              <TasteTestCard highlight={focus === "taste"} />
            </div>

            {/* 촬영 페르소나 (진입 CTA) — 취향 테스트와 결과물은 같지만 공유 루프가 붙어 있다 */}
            <div id="sec-persona" data-pid="sec-persona" className="mt-16 scroll-mt-24">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">02</span>
                <h2 className="text-title font-bold tracking-tight">촬영 페르소나</h2>
              </div>
              <PersonaTestCard />
            </div>

            {/* 인기순 카테고리 타일 (5개 → 더보기) */}
            <div id="sec-hot" className="mt-16 scroll-mt-24">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">03</span>
                <h2 className="text-title font-bold tracking-tight">추천 무드</h2>
              </div>
              <CategoryGrid items={gridItems} />
            </div>

            {/* 사매 인기 스냅 (게시물 사진 순환 가로 레일) */}
            {popular.length > 0 && (
              <div id="sec-recent" data-pid="sec-recent" className="mt-16 scroll-mt-24">
                <div className="mb-3 flex items-baseline gap-2 px-1">
                  <span className="font-display text-body-sm italic text-brand">04</span>
                  <h2 className="text-title font-bold tracking-tight">사매 인기 스냅</h2>
                </div>
                <RecentSnapsRail posts={popular} />
              </div>
            )}

            {/* 스냅 촬영 이야기 — 아티클 진입점. 정보 비대칭을 줄이는 롱폼이 여기서 열린다 */}
            {articles.length > 0 && (
              <div id="sec-articles" data-pid="sec-articles" className="mt-16 scroll-mt-24">
                <div className="mb-3 flex items-baseline gap-2 px-1">
                  <span className="font-display text-body-sm italic text-brand">05</span>
                  <h2 className="text-title font-bold tracking-tight">스냅 촬영 이야기</h2>
                  <Link href="/articles" className="ml-auto text-xs text-muted underline">
                    전체 보기
                  </Link>
                </div>
                <ArticleRail articles={articles} />
              </div>
            )}

            {/* 하단 여백 — 마지막 섹션이 플로팅 내비에 가리지 않을 정도만 확보.
                마지막 탭 활성은 ExploreTabBar 의 atBottom 폴백이 담당. */}
            <div aria-hidden className="h-20" />
          </>
        )}
      </div>
    </section>
  );
}
