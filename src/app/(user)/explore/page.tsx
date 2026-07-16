import { cookies } from "next/headers";
import {
  listPublishedExploreSections,
  rankExploreCategoriesByPopularity,
  listRecentPhotos,
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
import styles from "./explore.module.css";

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

  // 새로 올라온 스냅 (최신 공개 사진)
  const recent = await listRecentPhotos(12);

  // 커버 캐러셀 — 인기 상위 5개 카테고리를 각 3장씩(고화질 src_url) 순환.
  const coverCats: CoverCat[] = sections.slice(0, 5).map((s) => ({
    slug: s.category.slug,
    title: s.category.title,
    subtitle: s.category.subtitle,
    shots: s.photos.slice(0, 3).map((p) => ({ id: p.id, url: p.src_url })),
  }));

  // 카테고리 그리드 아이템 (대표 사진 고화질)
  const gridItems: GridItem[] = sections.map((s) => ({
    slug: s.category.slug,
    title: s.category.title,
    subtitle: s.category.subtitle,
    url: s.photos[0].src_url,
  }));

  // 트렌딩 태그 — 노출 사진들의 mood_tags 집계(실데이터). 없으면 티커 숨김.
  const trending = [
    ...new Set(sections.flatMap((s) => s.photos.flatMap((p) => p.mood_tags ?? []))),
  ]
    .filter(Boolean)
    .slice(0, 12);

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
            {/* 트렌딩 태그 티커 */}
            {trending.length > 0 && (
              <div className={`${styles.ticker} mt-4`}>
                <div className={styles.track}>
                  {[...trending, ...trending].map((t, i) => (
                    <span
                      key={`${t}-${i}`}
                      className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-caption font-medium text-muted"
                    >
                      <span className="mr-0.5 font-display italic text-brand-ink">#</span>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 무빙 커버 캐러셀 */}
            {coverCats.length > 0 && <MovingCoverCarousel cats={coverCats} />}

            {/* 인기순 카테고리 타일 (5개 → 더보기) */}
            <div className="mt-8">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">01</span>
                <h2 className="text-title font-bold tracking-tight">지금 뜨는 취향</h2>
              </div>
              <CategoryGrid items={gridItems} />
            </div>

            {/* 새로 올라온 스냅 (게시물 사진 순환 가로 레일) */}
            {recent.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 flex items-baseline gap-2 px-1">
                  <span className="font-display text-body-sm italic text-brand">02</span>
                  <h2 className="text-title font-bold tracking-tight">새로 올라온 스냅</h2>
                </div>
                <RecentSnapsRail posts={recent} />
              </div>
            )}

            {/* 취향 테스트 (진입 CTA) */}
            <div className="mt-8">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="font-display text-body-sm italic text-brand">03</span>
                <h2 className="text-title font-bold tracking-tight">취향 테스트</h2>
              </div>
              <TasteTestCard />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
