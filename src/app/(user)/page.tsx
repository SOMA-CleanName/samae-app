import {
  fetchPublishedPhotos,
  fetchLikedPhotoIds,
  fetchPhotoById,
  fetchHomeFeedPage,
  newFeedSeed,
  searchPhotosByTag,
} from "@/lib/discovery";
import {
  diversifySearchResults,
  searchPhotosBySiglip,
  SIGLIP_SEARCH_MAX_RESULTS,
} from "@/lib/siglip-text-search";
import { cookies } from "next/headers";
import { loadDemotedHomePhotos, loadMorePhotos, loadPersonalizedPhotos } from "./feed-actions";
import { logSearch } from "@/lib/search-log";
import { getCurrentUser } from "@/lib/auth";
import { TASTE_V2_COOKIE, parseTasteV2 } from "@/lib/category-constants";
import { rerankByPersonaVector } from "@/lib/persona/feed-rerank";
import {
  TASTE_TEST_NUDGE_COOKIE,
  TASTE_TEST_NUDGE_PERSISTENCE_ENABLED,
  TASTE_TEST_NUDGE_PREVIEW_ENABLED,
} from "@/lib/taste-test-nudge";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { FeedHero } from "@/components/user/FeedHero";
import { SearchDock } from "@/components/user/SearchDock";
import { PhotoTopBar } from "./photos/[id]/PhotoTopBar";
import { pickSearchPlaceholder } from "@/lib/search-copy";
import { routeSessionKey } from "@/lib/search-navigation";
import { shouldShowSearchUi } from "@/lib/search-ui-visibility";
import { TasteTestNudge } from "@/components/user/TasteTestNudge";
import { HomeBannerSlot } from "@/components/user/HomeBannerSlot";
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
  const showSearchUi = shouldShowSearchUi(query ? "results" : "home");
  const searchPlaceholder = showSearchUi
    ? pickSearchPlaceholder(Number.parseInt(newFeedSeed(), 36) / 2 ** 31)
    : "";
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

  // 취향 v2(samae_taste2) — 있으면 전체 피드를 전역 티어링으로 노출:
  // 목적∩무드(가장 먼저) → 목적만 → 무드만 → 일반 시드 피드. (fetchHomeFeedPage 공용)
  const cookieStore = await cookies();
  const { purposeIds, moodIds } = parseTasteV2(cookieStore.get(TASTE_V2_COOKIE)?.value);
  const tasteCatIds = [...purposeIds, ...moodIds];
  const tasteNudgeHidden =
    TASTE_TEST_NUDGE_PERSISTENCE_ENABLED &&
    cookieStore.get(TASTE_TEST_NUDGE_COOKIE)?.value === "1";

  let photos: GalleryPhoto[];
  if (isAllFeed && feedSeed) {
    photos = await fetchHomeFeedPage(feedSeed, 0, purposeIds, moodIds, 48);
    // RPC 미적용/오류로 비면 기존 방식 폴백
    if (photos.length === 0) {
      photos = (await fetchPublishedPhotos({})).slice(0, FEED_CAP);
    }
    // 페르소나 분석을 거친 방문자면 페이지 안 순서를 시각 유사도순으로 (0080, 실패 무해)
    photos = await rerankByPersonaVector(photos);
  } else {
    const basePhotos = query
      ? diversifySearchResults(
          query,
          ...(await Promise.all([
            searchPhotosByTag(query, {
              directOnly: true,
              limit: SIGLIP_SEARCH_MAX_RESULTS,
            }),
            searchPhotosBySiglip(query, SIGLIP_SEARCH_MAX_RESULTS),
          ])),
          SIGLIP_SEARCH_MAX_RESULTS
        )
      : await fetchPublishedPhotos({});
    if (query) await logSearch(query, basePhotos.length, me?.id);
    const merged = adAsGallery
      ? [adAsGallery, ...basePhotos.filter((p) => p.id !== adAsGallery.id)]
      : basePhotos;
    photos = merged.slice(
      0,
      query ? SIGLIP_SEARCH_MAX_RESULTS : FEED_CAP
    );
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
      <ScrollMemory routeKey={routeSessionKey("/", query)} />
      {/* 홈 최상단 운영 배너 캐러셀 (검색 모드 아닐 때만) */}
      {!query && <HomeBannerSlot />}
      {/* 홈 히어로 (검색 모드 아닐 때만) */}
      {!query && <FeedHero />}

      {/* 검색 결과의 뒤로가기는 유지하고, 검색 진입 UI만 플래그로 임시 숨긴다. */}
      {query ? <PhotoTopBar /> : null}
      {showSearchUi ? (
        <SearchDock
          key={query ?? "home"}
          initial={query ?? ""}
          placeholder={searchPlaceholder}
          variant={query ? "detail" : "home"}
        />
      ) : null}

      {/* 취향 적용 배너 (전체 피드 + 취향 v2 있을 때) */}
      {isAllFeed && tasteCatIds.length > 0 && <TasteBanner />}

      {/* 취향 미설정 사용자 — 홈 피드를 5초간 둘러본 뒤 하단 내비 위에서 테스트 안내 */}
      {isAllFeed &&
        (TASTE_TEST_NUDGE_PREVIEW_ENABLED ||
          (tasteCatIds.length === 0 && !tasteNudgeHidden)) && <TasteTestNudge />}

      <ExploreGallery
        photos={photos}
        query={query}
        likedIds={likedIds}
        spotlightId={spotlightId}
        loggedIn={!!me}
        spotlightFirstOnGeneral
        feedSeed={feedSeed}
        loadMore={loadMorePhotos}
        loadPersonalized={loadPersonalizedPhotos}
        loadDemoted={loadDemotedHomePhotos}
      />
    </section>
  );
}
