import {
  fetchPublishedPhotos,
  searchPhotosByTag,
  fetchLikedPhotoIds,
  fetchPhotoById,
  fetchSeededFeedPage,
  newFeedSeed,
} from "@/lib/discovery";
import { cookies } from "next/headers";
import { loadMorePhotos } from "./feed-actions";
import { logSearch } from "@/lib/search-log";
import { getCurrentUser } from "@/lib/auth";
import { TASTE_V2_COOKIE, parseTasteV2 } from "@/lib/category-constants";
import { purposeBoostWeight } from "@/lib/taste-purposes";
import { scoreTastePhotos, boostByTaste } from "@/lib/explore-db";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { FeedHero } from "@/components/user/FeedHero";
import { TasteBanner } from "./TasteBanner";
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
  // 카테고리 컨텍스트(?cat·쿠키)는 proxy 가 /c/<slug> 로 리다이렉트 → 여기(홈)는 검색·전체 피드만.

  const me = await getCurrentUser();
  // 광고 유입 온보딩(카테고리 없는 /?ad=<사진ID>) — 좌상단 첫 카드로 고정. (검색 모드 아닐 때)
  const adPhoto = !query && sp.ad ? await fetchPhotoById(sp.ad) : null;
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
  // 전체 피드(검색·광고 아님)는 시드 기반 무한 스크롤(0050 RPC). seed 는 요청마다 생성 →
  // 방문마다 순서 변주 + ExploreGallery 가 같은 seed 로 다음 페이지를 이어받아 무제한 노출.
  const isAllFeed = !query && !adAsGallery;
  const feedSeed = isAllFeed ? newFeedSeed() : undefined;

  // 취향 v2(samae_taste2) — 있으면 전체 피드를 목적/무드 카테고리 멤버십으로 가중랜덤(뭉침 없음).
  // 목적별 세기(개인=강, 웨딩·커플=약)로 부스트.
  const { purposeKey, purposeIds, moodIds } = parseTasteV2(
    (await cookies()).get(TASTE_V2_COOKIE)?.value
  );
  const tasteCatIds = [...purposeIds, ...moodIds];

  let photos: GalleryPhoto[];
  if (isAllFeed && feedSeed) {
    // 순수 시드 피드(랜덤·뭉침 없음)를 받아, 취향이 있으면 페이지 내에서 가중랜덤 부스트.
    const base =
      (await fetchSeededFeedPage(feedSeed, 0, 48)) ??
      (await fetchPublishedPhotos({})).slice(0, FEED_CAP);
    if (tasteCatIds.length > 0) {
      const score = await scoreTastePhotos(
        base.map((p) => p.id),
        tasteCatIds
      );
      photos = boostByTaste(base, score, feedSeed, purposeBoostWeight(purposeKey));
    } else {
      photos = base;
    }
  } else {
    const basePhotos = query ? await searchPhotosByTag(query) : await fetchPublishedPhotos({});
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

      {/* 취향 적용 배너 (전체 피드 + 취향 v2 있을 때) */}
      {isAllFeed && tasteCatIds.length > 0 && <TasteBanner />}

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
