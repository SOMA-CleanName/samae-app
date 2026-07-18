import { cookies } from "next/headers";
import {
  listPublishedExploreSections,
  rankExploreCategoriesByPopularity,
  listPopularPosts,
} from "@/lib/explore-db";
import { getPublishedCategory } from "@/lib/categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { MovingCoverCarousel, type CoverCat } from "./MovingCoverCarousel";
import { CategoryGrid, type GridItem } from "./CategoryGrid";
import { RecentSnapsRail } from "./RecentSnapsRail";
import { TasteTestCard } from "./TasteTestCard";
import { LiveViewers } from "./LiveViewers";
import { ExploreTabBar, type ExploreTab } from "./ExploreTabBar";

export const dynamic = "force-dynamic";

// 탐색 페이지 — 운영이 큐레이션한 카테고리(explore_categories)를 "매거진형"으로 노출.
// 무빙 커버 캐러셀 + 트렌딩 태그 티커 + 인기순 카테고리 타일(5개→더보기).
// 정렬: 광고(/c/<slug>) 진입 시 그 광고의 지정 순서, 아니면 실지표(조회·문의) 인기순.
export default async function ExplorePage() {
  const adSlug = (await cookies()).get(CATEGORY_COOKIE)?.value;
  const adCat = adSlug ? await getPublishedCategory(adSlug) : null;
  // 광고 진입이면 그 순서, 아니면 인기 점수순.
  const orderedIds = adCat?.exploreSectionIds ?? (await rankExploreCategoriesByPopularity());

  // 담긴 사진 3장 미만 카테고리는 빈약하므로 숨김(무빙 커버도 3컷 필요).
  const sections = (await listPublishedExploreSections(10, orderedIds)).filter(
    (s) => s.photos.length >= 3
  );

  // 지금 인기 스냅 (최근 1일 조회·문의·찜 신호로 랭킹) — 광고 유입이면 그 광고 카테고리 범위로,
  // 아니면 전역. 광고 범위에 인기 스냅이 없으면 전역으로 폴백(섹션이 비지 않게).
  let popular = await listPopularPosts(24, 1, adCat?.exploreSectionIds);
  if (adCat?.exploreSectionIds?.length && popular.length === 0) {
    popular = await listPopularPosts(24, 1);
  }

  // 커버 캐러셀 — 취향 필터가 없으면 존재하는 모든 카테고리(≥3장)를 각 3장씩(고화질 src_url) 순환.
  const coverCats: CoverCat[] = sections.map((s) => ({
    slug: s.category.slug,
    title: s.category.title,
    subtitle: s.category.subtitle,
    shots: s.photos.slice(0, 3).map((p) => ({ id: p.id, url: p.src_url })),
  }));

  // 카테고리 그리드 아이템 — 썸네일은 해당 카테고리 사진 중 랜덤(force-dynamic 이라 요청마다 변주).
  const gridItems: GridItem[] = sections.map((s) => ({
    slug: s.category.slug,
    title: s.category.title,
    subtitle: s.category.subtitle,
    url: s.photos[Math.floor(Math.random() * s.photos.length)].src_url,
  }));

  // 중간 메뉴바 탭 — 실제로 렌더되는 섹션만(스크롤 이동 대상).
  const tabs: ExploreTab[] = [
    { id: "sec-hot", label: "추천 무드" },
    ...(popular.length > 0 ? [{ id: "sec-recent", label: "지금 인기 스냅" }] : []),
    { id: "sec-taste", label: "내 취향 테스트" },
  ];

  return (
    <section className="font-kr">
      <MpTrackOnce event="View Explore Feed" props={{ section_count: sections.length }} />
      <ScrollMemory />

      <div className="px-2.5 pb-4 pt-3 sm:px-4 sm:pt-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="text-2xl font-bold tracking-tight">오늘의 큐레이션</h1>
          {sections.length > 0 && <LiveViewers />}
        </div>

        {sections.length === 0 ? (
          <p className="py-16 text-center text-body-sm text-muted">
            준비 중이에요. 곧 큐레이션한 카테고리를 보여드릴게요.
          </p>
        ) : (
          <>
            {/* 무빙 커버 캐러셀 */}
            {coverCats.length > 0 && <MovingCoverCarousel cats={coverCats} />}

            {/* 중간 메뉴바 — 커버(히어로) 아래. 스크롤하면 상단 고정 + '사매' 헤더 노출.
                (sticky 가 섹션 전체 구간 동안 고정되려면 래퍼로 감싸지 말 것) */}
            <ExploreTabBar tabs={tabs} />

            {/* 인기순 카테고리 타일 (5개 → 더보기) */}
            <div id="sec-hot" className="mt-6 scroll-mt-24">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">01</span>
                <h2 className="text-title font-bold tracking-tight">추천 무드</h2>
              </div>
              <CategoryGrid items={gridItems} />
            </div>

            {/* 지금 인기 스냅 (게시물 사진 순환 가로 레일) */}
            {popular.length > 0 && (
              <div id="sec-recent" data-pid="sec-recent" className="mt-16 scroll-mt-24">
                <div className="mb-3 flex items-baseline gap-2 px-1">
                  <span className="font-display text-body-sm italic text-brand">02</span>
                  <h2 className="text-title font-bold tracking-tight">지금 인기 스냅</h2>
                </div>
                <RecentSnapsRail posts={popular} />
              </div>
            )}

            {/* 취향 테스트 (진입 CTA) */}
            <div id="sec-taste" className="mt-16 scroll-mt-24">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">03</span>
                <h2 className="text-title font-bold tracking-tight">내 취향 테스트</h2>
              </div>
              <TasteTestCard />
            </div>

            {/* 하단 여백 — 취향 테스트(마지막 섹션)에서 스크롤이 적당히 끝나되 플로팅 내비에
                가리지 않을 정도만. 마지막 탭 활성은 ExploreTabBar 의 atBottom 폴백이 담당. */}
            <div aria-hidden className="h-20" />
          </>
        )}
      </div>
    </section>
  );
}
