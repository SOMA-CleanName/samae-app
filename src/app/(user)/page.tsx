import { cookies } from "next/headers";
import Link from "next/link";
import {
  fetchPublishedPhotos,
  fetchPhotosByTags,
  fetchUntaggedPhotos,
  searchPhotosByTag,
  fetchLikedPhotoIds,
  fetchPhotoById,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory, isUntaggedCategory } from "@/lib/categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ExploreHeader } from "@/components/user/ExploreHeader";
import type { GalleryPhoto } from "@/lib/discovery";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; ad?: string; cat?: string; nocat?: string };

export default async function ExploreHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();

  // ── 카테고리 컨텍스트 결정 ───────────────────────────────
  // 우선순위: 검색(q) > '전체 보기'(nocat) 해제 > URL ?cat > 쿠키(유지).
  // 광고 유입(/?cat=)으로 들어오면 proxy 가 쿠키를 심어, 이후 메인 복귀에도 유지된다.
  const cookieStore = await cookies();
  const cookieCat = cookieStore.get(CATEGORY_COOKIE)?.value || undefined;
  const activeSlug = query || sp.nocat ? undefined : sp.cat?.trim() || cookieCat;
  const category = activeSlug ? await getPublishedCategory(activeSlug) : null;

  // 광고 유입 온보딩 — URL ?ad=<사진ID>(광고 크리에이티브 사진)가 있을 때만,
  // 그 사진을 좌상단 첫 카드로 고정하고 스포트라이트로 서비스 소개. (검색 모드 아닐 때)
  const adPhoto = !query && sp.ad ? await fetchPhotoById(sp.ad) : null;

  // 피드: 검색 > 카테고리 알고리즘 > 전체 셔플
  const basePhotos = query
    ? await searchPhotosByTag(query)
    : category
      ? isUntaggedCategory(category.tags)
        ? await fetchUntaggedPhotos(300)
        : await fetchPhotosByTags(category.tags, 300)
      : await fetchPublishedPhotos({});

  // 광고 사진을 맨 앞으로 → 메이슨리 좌상단 첫 카드 = 광고 이미지
  const adAsGallery: GalleryPhoto | null = adPhoto
    ? {
        id: adPhoto.id,
        src_url: adPhoto.src_url,
        thumb_url: adPhoto.thumb_url,
        width: adPhoto.width,
        height: adPhoto.height,
        region: adPhoto.region,
        mood_tags: adPhoto.mood_tags ?? [],
        price_krw: adPhoto.price_krw,
        photographer: adPhoto.photographer ?? { id: adPhoto.photographer_id, display_name: null },
      }
    : null;
  const photos = adAsGallery
    ? [adAsGallery, ...basePhotos.filter((p) => p.id !== adAsGallery.id)]
    : basePhotos;
  const spotlightId = adAsGallery?.id;

  // 현재 사용자가 좋아요한 사진(갤러리 하트 초기 상태)
  const me = await getCurrentUser();
  const likedIds = await fetchLikedPhotoIds(
    photos.map((p) => p.id),
    me?.id
  );

  return (
    <section className="px-3 pb-10 font-kr sm:px-5">
      <ExploreHeader />

      {/* 카테고리 알고리즘 보는 중 표시 + 전체 보기 해제 (검색 모드 아닐 때만) */}
      {category && !query && (
        <div className="mx-auto mt-1 flex max-w-screen-2xl items-center gap-2 px-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-caption font-medium text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {category.name} 추천 보는 중
          </span>
          <Link
            href="/?nocat=1"
            className="rounded-full px-2.5 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
          >
            전체 보기 ✕
          </Link>
        </div>
      )}

      <ExploreGallery
        photos={photos}
        query={query}
        likedIds={likedIds}
        spotlightId={spotlightId}
        loggedIn={!!me}
        spotlightFirstOnGeneral
      />
    </section>
  );
}
