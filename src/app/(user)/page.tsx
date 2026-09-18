import {
  fetchPublishedPhotos,
  fetchLikedPhotoIds,
  fetchPhotoById,
  fetchHomeFeedPage,
  newFeedSeed,
} from "@/lib/discovery";
import { searchPhotos, SIGLIP_SEARCH_MAX_RESULTS } from "@/lib/siglip-text-search";
import { spreadAlbumsInBands } from "@/lib/siglip-text-search-core";
import { cookies } from "next/headers";
import { loadDemotedHomePhotos, loadMorePhotos, loadPersonalizedPhotos } from "./feed-actions";
import { logSearch } from "@/lib/search-log";
import { getCurrentUser } from "@/lib/auth";
import { TASTE_V2_COOKIE, parseTasteV2 } from "@/lib/category-constants";
import { rerankByPersonaVector } from "@/lib/persona/feed-rerank";
import {
} from "@/lib/taste-test-nudge";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { FeedHero } from "@/components/user/FeedHero";
import { SearchDock } from "@/components/user/SearchDock";
import { SearchBackButton } from "@/components/user/SearchBackButton";
import { SearchResultsHead } from "@/components/user/SearchResultsHead";
import { pickSearchPlaceholder, SEARCH_PLACEHOLDER_SHORT } from "@/lib/search-copy";
import { routeSessionKey, SEARCH_RELATED_SCOPE } from "@/lib/search-navigation";
import { shouldShowSearchUi } from "@/lib/search-ui-visibility";
import { HomeBannerSlot } from "@/components/user/HomeBannerSlot";
import { HomeQuickNav } from "@/components/user/HomeQuickNav";
import { HomeDiscoverySections } from "./HomeDiscoverySections";
import { ScrollTopButton } from "@/components/user/ScrollTopButton";
import { ProfileButton } from "@/components/user/ProfileButton";
import { toProfileMe } from "@/lib/profile-me";
import { buildFeedInterstitials } from "@/lib/feed-interstitials";
import { JsonLd } from "@/components/JsonLd";
import { siteJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/SiteFooter";
import type { Metadata } from "next";
import type { GalleryPhoto } from "@/lib/discovery";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; ad?: string; cat?: string; nocat?: string };

/*
  검색 결과(/?q=)와 광고 진입(/?ad=)은 색인하지 않는다.

  둘 다 홈과 같은 라우트라 루트 layout 의 제목·설명·canonical("/")을 그대로 쓴다.
  canonical 이 홈을 가리키니 중복 색인 위험 자체는 낮지만, 쿼리는 사용자가 무한히
  만들 수 있어서 링크가 하나라도 걸리면 크롤 예산이 그리로 샌다.
  follow 는 남긴다 — 결과에 걸린 사진 페이지들은 계속 타고 들어가야 한다.

  ⚠️ 매개변수가 없을 때는 아무것도 돌려주지 않는다. 여기서 robots 를 통째로 지정하면
     **홈까지** 그 값을 쓰게 된다.
*/
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  if (!sp.q?.trim() && !sp.ad) return {};
  return { robots: { index: false, follow: true } };
}

export default async function ExploreHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();
  const showSearchUi = shouldShowSearchUi(query ? "results" : "home");
  const searchPlaceholder = showSearchUi
    ? pickSearchPlaceholder()
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

  let photos: GalleryPhoto[];
  // 검색 결과 아래 "비슷한 무드의 사진들이에요" 에 깔 사진 — 목적은 다르지만 무드가 가깝다.
  let relatedPhotos: GalleryPhoto[] = [];
  // 검색 결과 머리줄에 적을 수 — 검색어에 맞는 사진만 센다.
  let searchCounts: SearchCounts | null = null;
  if (isAllFeed && feedSeed) {
    photos = await fetchHomeFeedPage(feedSeed, 0, purposeIds, moodIds, 48);
    // RPC 미적용/오류로 비면 기존 방식 폴백
    if (photos.length === 0) {
      photos = (await fetchPublishedPhotos({})).slice(0, FEED_CAP);
    }
    // 페르소나 분석을 거친 방문자면 페이지 안 순서를 시각 유사도순으로 (0080, 실패 무해)
    photos = await rerankByPersonaVector(photos);
  } else {
    const search = query ? await searchHomePhotos(query) : null;
    searchCounts = search?.counts ?? null;
    relatedPhotos = search?.related ?? [];
    const basePhotos = search ? search.matches : await fetchPublishedPhotos({});
    if (query) await logSearch(query, basePhotos.length, me?.id);
    const merged = adAsGallery
      ? [adAsGallery, ...basePhotos.filter((p) => p.id !== adAsGallery.id)]
      : basePhotos;
    // 검색은 z 가 장수를 정하므로 자르지 않는다. 전체 목록만 FEED_CAP 으로 자른다.
    photos = query ? merged : merged.slice(0, FEED_CAP);
  }
  const spotlightId = adAsGallery?.id;

  /*
    피드 사이 카드 — 읽을거리와 작가를 번갈아.
    아티클·장소는 이미 메모에 있고 작가는 이 피드 사진에서 세므로 추가 쿼리가 없다.
    전체 피드일 때만 만든다(검색·광고 진입에는 안 넣는다).
  */
  const interstitials = isAllFeed ? await buildFeedInterstitials(photos) : [];

  const likedIds = await fetchLikedPhotoIds(
    [...photos, ...relatedPhotos].map((p) => p.id),
    me?.id
  );

  return (
    /*
      지면 폭 상한 — 로고 줄·검색·배너·바로가기가 각자 max-w-screen-2xl(1536px)로
      가운데 정렬인데 그 아래 갤러리만 안 그랬다. 1536px 넘는 모니터(16" 맥북 = 1728)
      에서는 위 네 층은 가운데 모이고 사진만 화면 끝까지 흘러 줄이 안 맞았다.
      게다가 갤러리 컬럼은 flex-1 이라 폭이 남으면 컬럼당 220px 설계치를 넘어
      2560px 에서는 한 장이 360px 까지 커진다. 상한을 지면 전체로 올린다.
    */
    <section className="mx-auto max-w-screen-2xl px-2.5 pb-2.5 pt-3.5 font-kr sm:px-4 sm:pt-5 sm:pb-4">
      {/* 브랜드 구조화데이터 — Organization(사매) + WebSite(검색박스) */}
      {!query && <JsonLd data={siteJsonLd()} />}
      {/* 탭 전환 시 스크롤 위치 유지 */}
      <ScrollMemory routeKey={routeSessionKey("/", query)} />
      {/* 로고·프로필 → 검색 → 배너 → 바로가기 순.
          배너를 로고 위에 두면 들어오자마자 브랜드가 아니라 광고가 먼저 보인다.
          (검색 모드에서는 로고 줄부터 아래 층까지 걷어내고 결과에 집중) */}
      {!query && (
        <FeedHero
          /*
            로고 ─ 검색 ─ 프로필 **한 줄** (모바일 포함).

            안내 문구는 짧은 판을 쓴다. 모바일 390 에서 이 줄의 검색칸은 ~210px 라
            긴 문장이 잘린다. 잘린 문장은 안 읽히고 잘렸다는 사실만 보인다.
            (데스크톱은 칸이 넓어 긴 문장도 들어가지만, 같은 자리에 폭에 따라 다른
             말을 띄우려면 입력칸을 둘로 만들어야 한다 — 그만한 값어치가 없다)
          */
          search={
            showSearchUi ? (
              <SearchDock
                key="home-inline"
                initial=""
                placeholder={SEARCH_PLACEHOLDER_SHORT}
                variant="home"
                inline
              />
            ) : undefined
          }
          right={
            <ProfileButton
              loggedIn={!!me}
              avatarUrl={me?.avatarUrl ?? null}
              // 시트를 여는 데 필요한 것들. 하단 좌측 아바타를 없애면서
              // 이 버튼이 계정 메뉴의 유일한 문이 됐다(FloatingNav 주석 참고).
              me={toProfileMe(me)}
            />
          }
        />
      )}

      {/* 검색 — 로고 줄 바로 아래 한 줄. 스크롤하면 상단에 붙는다(SearchDock 자체 sticky).
          결과 화면에서는 나가는 버튼을 같은 줄 왼쪽에 세운다.
          검색 모드(?q=)에서는 로고 줄을 걷어내므로 데스크톱에서도 이 줄이 유일한 검색창이다. */}
      {/* 검색 모드(?q=)에서만 남는 줄. 그때는 로고 줄을 통째로 걷어내므로 이게 유일한
          검색창이고, 긴 안내 문구가 그대로 들어간다. */}
      {showSearchUi && query ? (
        <SearchDock
          key={query}
          initial={query}
          placeholder={searchPlaceholder}
          variant="detail"
          back={<SearchBackButton query={query} />}
        />
      ) : null}

      {/* 무엇을 찾았고 몇 장인지 — 전에는 이 화면에 글자가 하나도 없었다 */}
      {query ? (
        <SearchResultsHead
          query={query}
          // 검색어에 맞는 사진만 센다. "가을 커플스냅" 이면 커플 사진 수다 — 아래에 붙는
          // 다른 목적의 가을 사진까지 세면 커플이 229장인데 300장+ 로 적히는 일이 생긴다.
          count={searchCounts?.matches ?? photos.length}
          // 상한(300)에 딱 걸렸으면 그건 찾은 수가 아니라 잘린 수다 — "+"로 표시한다.
          capped={searchCounts?.capped ?? false}
        />
      ) : null}
      {!query && <HomeBannerSlot />}

      {/*
        바로가기 + 무드 — 데스크톱에서는 **좌/우 2단**(인계노트 D2·D3).

        세로로 쌓아 두니 데스크톱에서 칩 5개가 좌측 570px 에 몰리고 오른쪽 850px 가
        통째로 비었다. 무드 레일도 한 줄을 따로 먹어 첫 화면이 그만큼 밀렸다.
        둘을 나란히 놓으면 빈 공간이 채워지고 사진이 한 화면 위로 올라온다.

        모바일은 그대로 세로다 — 좁은 폭에서 2단은 둘 다 쥐어짜인다.

        ⚠️ 무드는 광고 유입(?ad=)에서 렌더하지 않는다. 광고로 들어온 사람은 그 사진을
           보러 온 거라, 큐레이션을 먼저 깔면 정작 클릭한 사진이 두 화면 아래로 밀린다.
           그때는 바로가기만 한 줄로 남는다.
      */}
      {!query && (
        <div className="mb-4 lg:grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <HomeQuickNav />
          {isAllFeed && <HomeDiscoverySections />}
        </div>
      )}

      {/*
        아래부터는 전체 피드. 그 머리는 피드의 것이라 여기서 그린다.
        (전에는 HomeDiscoverySections 안에 있었는데, 위 2단으로 묶이면서 오른쪽 칸에
         딸려 들어가면 안 돼서 옮겼다)
        id 는 '맨 위로' 버튼이 나타날 기준점이기도 하다.
      */}
      {!query && (
        <div id="sec-all-photos" className="mb-2.5 scroll-mt-20 px-1">
          <span aria-hidden className="mb-2 block h-[2px] w-6 bg-brand" />
          <h2 className="text-body font-bold tracking-tight">전체 사진</h2>
        </div>
      )}

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

      {/* 검색어에 맞는 사진이 끝난 자리 — 목적은 같고 무드가 조금 먼 사진을 이어 보여준다.
          ("가을 커플스냅" 이면 나머지 커플 사진을 가을 순으로.) 검색어에 목적이 없으면 없다.
          사진을 세로 칸에 나눠 까는 배치라 한 목록 중간에 제목을 끼울 수 없어 갤러리를 따로 둔다. */}
      {relatedPhotos.length > 0 && (
        <section aria-labelledby="search-related-heading" className="mt-10 sm:mt-14">
          <h2 id="search-related-heading" className="mx-auto mb-3 max-w-screen-2xl px-1 text-body font-bold tracking-tight">
            비슷한 무드의 사진들이에요
          </h2>
          <ExploreGallery
            photos={relatedPhotos}
            query={query}
            likedIds={likedIds}
            loggedIn={!!me}
            sessionScope={SEARCH_RELATED_SCOPE}
          />
        </section>
      )}

      {/* 지면의 끝 — 피드가 자동 이어붙이기를 멈춘 자리(ExploreGallery AUTO_ADVANCE_BUDGET)
          바로 아래다. 사업자 정보·약관·처리방침이 여기 있고, 전자상거래법 제10조가 요구하는
          '초기화면 표시' 를 **모바일에서도** 충족한다(예전 SiteInfoBar 는 데스크톱 전용이라
          모바일에는 사업자 정보가 아예 없었다). */}
      <SiteFooter />
    </section>
  );
}

type SearchCounts = {
  /** 검색어에 맞는 사진 — 목적이 있으면 그 목적 사진, 없으면 전부 */
  matches: number;
  /** 목적은 같고 무드가 조금 먼 사진 — 아래 "비슷한 무드의 사진들이에요" */
  related: number;
  /** 300장 상한에서 잘렸나 — 목적만 검색했을 때만 생긴다. 걸렸으면 "300장+" 로 적는다 */
  capped: boolean;
};

/**
 * 검색 결과 — z 2.5 이상이 위, 2.0~2.5 가 아래 "비슷한 무드의 사진들이에요", 그 아래는 없다.
 * 검색어에 목적이 있으면 위·아래 모두 그 목적 사진만 보여준다.
 *
 * 앨범 흩뜨리기는 두 묶음 **안에서 따로** 한다. 합쳐서 섞으면 아래 묶음 사진이 위로 올라온다.
 * 태그 검색은 쓰지 않는다 — SigLIP 만으로 만든다.
 *
 * 실패는 여기서 삼킨다 — 이 화면에는 재시도 UI 가 없어서 던지면 홈 전체가 에러가 된다.
 */
async function searchHomePhotos(query: string): Promise<{
  matches: GalleryPhoto[];
  related: GalleryPhoto[];
  counts: SearchCounts;
}> {
  const result = await searchPhotos(query, SIGLIP_SEARCH_MAX_RESULTS).catch((error) => {
    console.error("[home] 검색 실패:", error);
    return null;
  });
  if (!result) return { matches: [], related: [], counts: { matches: 0, related: 0, capped: false } };
  // 장수는 z 가 정한다 — 여기서 다시 자르지 않는다. 앨범 흩뜨리기만 두 묶음 안에서 따로 한다.
  const matches = spreadAlbumsInBands(result.matches);
  const related = spreadAlbumsInBands(result.related);
  return {
    matches,
    related,
    counts: { matches: matches.length, related: related.length, capped: result.capped },
  };
}
