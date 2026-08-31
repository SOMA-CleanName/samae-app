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
import { SearchBackButton } from "@/components/user/SearchBackButton";
import { SearchResultsHead } from "@/components/user/SearchResultsHead";
import { pickSearchPlaceholder } from "@/lib/search-copy";
import { routeSessionKey } from "@/lib/search-navigation";
import { shouldShowSearchUi } from "@/lib/search-ui-visibility";
import { TasteTestNudge } from "@/components/user/TasteTestNudge";
import { HomeBannerSlot } from "@/components/user/HomeBannerSlot";
import { HomeQuickNav } from "@/components/user/HomeQuickNav";
import { HomeDiscoverySections } from "./HomeDiscoverySections";
import { ScrollTopButton } from "@/components/user/ScrollTopButton";
import { ProfileButton } from "@/components/user/ProfileButton";
import { buildFeedInterstitials } from "@/lib/feed-interstitials";
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

  /*
    피드 사이 카드 — 읽을거리와 작가를 번갈아.
    아티클·장소는 이미 메모에 있고 작가는 이 피드 사진에서 세므로 추가 쿼리가 없다.
    전체 피드일 때만 만든다(검색·광고 진입에는 안 넣는다).
  */
  const interstitials = isAllFeed ? await buildFeedInterstitials(photos) : [];

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
      {/* 로고·프로필 → 검색 → 배너 → 바로가기 순.
          배너를 로고 위에 두면 들어오자마자 브랜드가 아니라 광고가 먼저 보인다.
          (검색 모드에서는 로고 줄부터 아래 층까지 걷어내고 결과에 집중) */}
      {!query && (
        <FeedHero right={<ProfileButton loggedIn={!!me} avatarUrl={me?.avatarUrl ?? null} />} />
      )}

      {/* 검색 — 로고 줄 바로 아래 한 줄. 스크롤하면 상단에 붙는다(SearchDock 자체 sticky).
          결과 화면에서는 나가는 버튼을 같은 줄 왼쪽에 세운다. */}
      {showSearchUi ? (
        <SearchDock
          key={query ?? "home"}
          initial={query ?? ""}
          placeholder={searchPlaceholder}
          variant={query ? "detail" : "home"}
          back={query ? <SearchBackButton query={query} /> : undefined}
        />
      ) : null}

      {/* 무엇을 찾았고 몇 장인지 — 전에는 이 화면에 글자가 하나도 없었다 */}
      {query ? (
        <SearchResultsHead
          query={query}
          count={photos.length}
          // 상한(300)에 딱 걸렸으면 그건 찾은 수가 아니라 잘린 수다 — "+"로 표시한다.
          capped={photos.length >= SIGLIP_SEARCH_MAX_RESULTS}
        />
      ) : null}
      {!query && <HomeBannerSlot />}
      {!query && <HomeQuickNav />}

      {/*
        탐색 탭에 있던 사진 섹션들(오늘의 큐레이션·추천 무드·인기 스냅)을 여기로 옮겼다.
        탐색은 이제 매거진이고 사진은 홈 한 곳에 모인다.

        ⚠️ 광고 유입(?ad=)에서는 렌더하지 않는다. 광고로 들어온 사람은 그 사진을 보러
           온 거라, 큐레이션을 먼저 깔면 정작 클릭한 사진이 두 화면 아래로 밀린다.
      */}
      {isAllFeed && <HomeDiscoverySections />}

      {/* 취향 미설정 사용자 — 홈 피드를 5초간 둘러본 뒤 하단 내비 위에서 테스트 안내 */}
      {isAllFeed &&
        (TASTE_TEST_NUDGE_PREVIEW_ENABLED ||
          (tasteCatIds.length === 0 && !tasteNudgeHidden)) && <TasteTestNudge />}

      {/* 맨 위로 — '전체 사진' 머리를 지나야 나타난다 */}
      {isAllFeed && <ScrollTopButton anchorId="sec-all-photos" />}

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
        interstitials={interstitials}
      />
    </section>
  );
}
