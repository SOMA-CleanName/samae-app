/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { listPublishedCategories } from "@/lib/categories";
import { fetchPhotosByTags, fetchUntaggedPhotos } from "@/lib/discovery";
import { isUntaggedCategory } from "@/lib/category-constants";
import { SearchPill } from "@/components/user/SearchPill";
import { ChevronRightIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

// 탐색 페이지 — 상단 검색바 + 카테고리별 가로 미리보기 섹션.
// 섹션(더보기) 클릭 → /?cat=slug (쿠키로 카테고리 컨텍스트 고정 → 메인이 그 카테고리 우선).
export default async function ExplorePage() {
  const categories = await listPublishedCategories();
  const sections = await Promise.all(
    categories.map(async (c) => ({
      c,
      photos: isUntaggedCategory(c.tags)
        ? await fetchUntaggedPhotos(14)
        : await fetchPhotosByTags(c.tags, 14),
    }))
  );

  return (
    <section className="font-kr">
      {/* 상단 검색바 (sticky) */}
      <div className="sticky top-0 z-30 flex items-center gap-2 bg-bg/90 px-4 py-3 backdrop-blur sm:px-5">
        <SearchPill />
      </div>

      <div className="space-y-7 px-4 pb-4 pt-2 sm:px-5">
        {sections.map(
          ({ c, photos }) =>
            photos.length > 0 && (
              <div key={c.id}>
                <Link
                  href={`/?cat=${encodeURIComponent(c.slug)}`}
                  className="mb-2.5 flex items-center justify-between gap-2"
                >
                  <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
                  <span className="flex items-center gap-0.5 text-sm font-medium text-muted">
                    더보기 <ChevronRightIcon className="h-4 w-4" />
                  </span>
                </Link>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
                  {photos.map((p) => (
                    <Link
                      key={p.id}
                      href={`/photos/${p.id}`}
                      className="block shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]"
                    >
                      <img
                        src={p.thumb_url ?? p.src_url}
                        alt=""
                        loading="lazy"
                        className="h-44 w-32 object-cover"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )
        )}
      </div>
    </section>
  );
}
