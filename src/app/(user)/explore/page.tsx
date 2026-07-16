import Link from "next/link";
import { cookies } from "next/headers";
import { listPublishedExploreSections } from "@/lib/explore-db";
import { getPublishedCategory } from "@/lib/categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { ChevronRightIcon } from "@/components/user/icons";
import { ExploreStrip } from "./ExploreStrip";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { MpTrackOnce } from "@/components/MpTrackOnce";

export const dynamic = "force-dynamic";

// 탐색 페이지 — 운영이 어드민에서 큐레이션한 카테고리별 가로 미리보기(편집형).
// 섹션 전체(이름·더보기·사진) 클릭 → 해당 카테고리 탐색 페이지(/explore/[slug]).
// 순서·멤버십은 운영이 정한 값(explore_categories · explore_category_photos). (docs/20)
// 광고(/c/<slug>) 진입 시 samae_cat 쿠키로 그 광고에 지정된 카테고리만 순서대로 노출.
export default async function ExplorePage() {
  // 광고 진입 컨텍스트 — 지정돼 있으면 그 광고의 explore_section_ids 로 교체.
  const adSlug = (await cookies()).get(CATEGORY_COOKIE)?.value;
  const adCat = adSlug ? await getPublishedCategory(adSlug) : null;
  const orderedIds = adCat?.exploreSectionIds;

  // 담긴 사진 4장 미만 카테고리는 스트립이 빈약하므로 숨김(공개했어도).
  const sections = (await listPublishedExploreSections(10, orderedIds)).filter(
    (s) => s.photos.length >= 4
  );

  return (
    <section className="font-kr">
      {/* 탐색 피드 진입 — 발견 퍼널 상단 */}
      <MpTrackOnce event="View Explore Feed" props={{ section_count: sections.length }} />
      <ScrollMemory />
      <div className="space-y-7 px-2.5 pb-2.5 pt-2.5 sm:px-4 sm:pt-4 sm:pb-4">
        <h1 className="text-xl font-bold tracking-tight">탐색</h1>
        {sections.length === 0 ? (
          <p className="py-16 text-center text-body-sm text-muted">
            준비 중이에요. 곧 큐레이션한 카테고리를 보여드릴게요.
          </p>
        ) : (
          sections.map(({ category, photos }) => (
            <Link key={category.id} href={`/explore/${category.slug}`} className="group block">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{category.title}</h2>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted transition-colors group-hover:bg-fg/10 group-hover:text-fg">
                  <ChevronRightIcon className="h-4 w-4" />
                </span>
              </div>
              {/* 저스티파이드 행 — 사진 원본 비율 그대로, 한 줄 폭 꽉 채움 */}
              <ExploreStrip photos={photos} />
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
