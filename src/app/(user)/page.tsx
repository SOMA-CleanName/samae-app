import { cookies } from "next/headers";
import Link from "next/link";
import {
  fetchPublishedPhotos,
  fetchCategoryFeed,
  searchPhotosByTag,
  fetchLikedPhotoIds,
  fetchPhotoById,
  fetchSeededFeedPage,
  newFeedSeed,
} from "@/lib/discovery";
import { loadMorePhotos } from "./feed-actions";
import { logSearch } from "@/lib/search-log";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory, isUntaggedCategory } from "@/lib/categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { FeedHero } from "@/components/user/FeedHero";
import { JsonLd } from "@/components/JsonLd";
import { siteJsonLd } from "@/lib/seo";
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

  // 카테고리·로그인유저·광고사진은 서로 독립 → 병렬로 시작.
  // (피드는 카테고리에 의존하므로 카테고리 해석 후 조회)
  const categoryPromise = activeSlug ? getPublishedCategory(activeSlug) : Promise.resolve(null);
  const mePromise = getCurrentUser();
  // 광고 유입 온보딩 — URL ?ad=<사진ID>가 있을 때만 좌상단 첫 카드로 고정. (검색 모드 아닐 때)
  const adPromise = !query && sp.ad ? fetchPhotoById(sp.ad) : Promise.resolve(null);

  const category = await categoryPromise;
  const [me, adPhoto] = await Promise.all([mePromise, adPromise]);

  // 광고 사진을 맨 앞으로 → 메이슨리 좌상단 첫 카드 = 광고 이미지 (?ad= 온보딩)
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

  const FEED_CAP = 160;
  // 전체 피드(검색·카테고리·광고 아님)는 시드 기반 '무한 스크롤'(0050 RPC). seed 는 요청마다
  // 생성 → 방문마다 순서 변주 + ExploreGallery 가 같은 seed 로 다음 페이지를 이어받아 무제한 노출.
  // 검색/카테고리/광고는 기존 방식(풀 셔플 + 상한 노출).
  const isAllFeed = !query && !category && !adAsGallery;
  const feedSeed = isAllFeed ? newFeedSeed() : undefined;

  let photos: GalleryPhoto[];
  if (isAllFeed && feedSeed) {
    // 마이그레이션 전(RPC 없음)이면 page0 가 null → 기존 방식 폴백(스크롤은 상한에서 멈춤)
    photos =
      (await fetchSeededFeedPage(feedSeed, 0)) ?? (await fetchPublishedPhotos({})).slice(0, FEED_CAP);
  } else {
    const basePhotos = query
      ? await searchPhotosByTag(query)
      : category
        ? await fetchCategoryFeed(category.tags, isUntaggedCategory(category.tags))
        : await fetchPublishedPhotos({});
    if (query) await logSearch(query, basePhotos.length, me?.id);
    const merged = adAsGallery
      ? [adAsGallery, ...basePhotos.filter((p) => p.id !== adAsGallery.id)]
      : basePhotos;
    photos = merged.slice(0, FEED_CAP);
  }
  const spotlightId = adAsGallery?.id;

  const likedIds = await fetchLikedPhotoIds(
    photos.map((p) => p.id),
    me?.id
  );

  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      {/* 브랜드 구조화데이터 — Organization(사매) + WebSite(검색박스) */}
      {!query && <JsonLd data={siteJsonLd()} />}
      {/* 탭 전환 시 스크롤 위치 유지 */}
      <ScrollMemory />
      {/* 홈 최상단 히어로 (검색 모드 아닐 때만) */}
      {!query && <FeedHero />}

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
        feedSeed={feedSeed}
        loadMore={loadMorePhotos}
      />
    </section>
  );
}
