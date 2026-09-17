import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory } from "@/lib/categories";
import { fetchTargetCategoryFeed, fetchLikedPhotoIds, fetchPhotoById } from "@/lib/discovery";
import { resolveTargetPhotoIds } from "@/lib/target-categories";
import type { GalleryPhoto } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { FeedHero } from "@/components/user/FeedHero";
import { SearchDock } from "@/components/user/SearchDock";
import { SEARCH_PLACEHOLDER_SHORT } from "@/lib/search-copy";
import { shouldShowSearchUi } from "@/lib/search-ui-visibility";
import { ProfileButton } from "@/components/user/ProfileButton";
import { toProfileMe } from "@/lib/profile-me";
import { HomeBannerSlot } from "@/components/user/HomeBannerSlot";
import { HomeQuickNav } from "@/components/user/HomeQuickNav";
import { HomeDiscoverySections } from "../../HomeDiscoverySections";
import { ScrollTopButton } from "@/components/user/ScrollTopButton";
import { buildFeedInterstitials } from "@/lib/feed-interstitials";
import { SiteFooter } from "@/components/SiteFooter";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";
import type { Metadata } from "next";
import { categoryMetadata, collectionJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

type SearchParams = { ad?: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getPublishedCategory(safeDecode(slug));
  return category ? categoryMetadata(category.name, slug) : {};
}

// 잘못된 인코딩(혹은 이미 디코딩된 값)이 와도 throw 없이 원본을 돌려줌
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// 카테고리 페이지 — 유일한 카테고리 화면(홈의 ?cat·쿠키는 여기로 리다이렉트되어 통일).
// 광고 유입(/c/<slug>?utm_*, /c/<slug>?ad=<사진id>). 매칭 사진 먼저 + 나머지 전체.
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않음 — 한글 slug 매칭 위해 직접 디코딩
  const decodedSlug = safeDecode(slug);
  const [category, me] = await Promise.all([
    getPublishedCategory(decodedSlug),
    getCurrentUser(),
  ]);
  if (!category) notFound();

  // 온보딩 강조 사진 = ?ad=<사진ID> 우선, 없으면 이 카테고리의 대표(광고 소재 맨 앞) →
  // 광고 URL(?ad) 없이 /c/<slug> 로 그냥 들어와도 대표 사진이 강조/온보딩된다. (어드민 '광고 소재 채택'에서 대표 지정)
  const spotlightPhotoId = sp.ad || category.adPhotoIds[0] || undefined;
  // 사진 선정은 타겟 멤버십(앨범 상속 ∪ 수동추가 − 제외)으로만 한다 — 무드 태그 무관.
  const [adPhoto, memberIds] = await Promise.all([
    spotlightPhotoId ? fetchPhotoById(spotlightPhotoId) : Promise.resolve(null),
    resolveTargetPhotoIds(category.id),
  ]);
  const base = await fetchTargetCategoryFeed(memberIds, category.orderedPhotoIds);

  // 강조 사진을 좌상단 첫 카드로 고정
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

  // 카테고리 매칭 사진 먼저 + 나머지 전체 → 스크롤로 결국 모든 사진 노출(상한 없음)
  const photos = adAsGallery
    ? [adAsGallery, ...base.filter((p) => p.id !== adAsGallery.id)]
    : base;
  const spotlightId = adAsGallery?.id;

  const likedIds = me ? await fetchLikedPhotoIds(photos.map((p) => p.id), me.id) : [];

  /*
    광고 진입인가 — **`?ad=` 가 실제로 붙어 온 경우만** 이다.

    `adAsGallery` 로 판단하면 안 된다. 이 지면은 `?ad` 가 없어도 카테고리 대표
    사진(`category.adPhotoIds[0]`)을 강조 대상으로 잡으므로, 평소 진입에서도
    "광고 진입"으로 오인돼 무드·사이 카드가 통째로 사라진다.
    홈도 `sp.ad` 로만 판단한다((user)/page.tsx).
  */
  const isAdEntry = !!sp.ad;


  // 피드 사이 카드(읽을거리·작가) — 홈과 같다. 광고 진입에서는 빼는데,
  // 그 사진을 보러 온 사람인데 사이 카드가 끼면 정작 클릭한 사진이 아래로 밀리기 때문이다.
  const interstitials = isAdEntry ? [] : await buildFeedInterstitials(photos);

  /*
    검색·AI 가 읽을 구조. 여기만 JSON-LD 가 하나도 없었다(2026-09-17 점검) —
    /explore/{slug} 는 CollectionPage 를 심는데 같은 성격인 /c/{slug} 는 비어 있었다.
    사진이 없으면 collectionJsonLd 가 null 을 주고 아무것도 안 심는다.
  */
  const collection = collectionJsonLd({
    title: `${category.name} 사진`,
    path: `/c/${slug}`,
    photoIds: photos.map((p) => p.id),
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: category.name, path: `/c/${slug}` },
  ]);

  return (
    // 지면 폭 상한 — 홈과 같은 이유·같은 값. (근거는 (user)/page.tsx 주석)
    <section className="mx-auto max-w-screen-2xl px-2.5 pb-2.5 pt-3.5 font-kr sm:px-4 sm:pt-5 sm:pb-4">
      {collection && <JsonLd data={collection} />}
      <JsonLd data={breadcrumb} />
      <ScrollMemory />
      {/*
        ⚠️ 이 지면의 층 순서는 **홈(/)과 같아야 한다.**

        `samae_cat` 쿠키가 있으면 proxy 가 `/` 를 여기로 리다이렉트한다(proxy.ts).
        즉 한 번 카테고리에 들어온 사람에게는 여기가 사실상 홈이다. 그런데 검색창·
        바로가기·무드가 빠져 있어서, 하단 '홈' 탭을 눌러도 그 셋이 사라진 다른 지면이
        나왔다. 카테고리는 **피드의 필터**지 다른 화면이 아니다.

        홈과 같은 순서:  로고·프로필 → 검색 → 배너 → 바로가기 → [보는 중] → 무드 → 피드
        (`(user)/page.tsx` 를 고치면 여기도 같이 맞출 것)
      */}
      {/* 로고 ─ 검색 ─ 프로필 한 줄 (홈과 같다). 검색은 카테고리에 매이지 않으므로
          그대로 `/?q=` 로 나간다 — proxy 는 ?q 가 있으면 리다이렉트하지 않는다. */}
      <FeedHero
        search={
          shouldShowSearchUi("home") ? (
            <SearchDock
              key="cat-inline"
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
            me={toProfileMe(me)}
          />
        }
      />

      <HomeBannerSlot />

      {/* 카테고리 추천 보는 중 + 전체 보기 해제(쿠키도 해제됨 → /?nocat=1) */}
      <div className="mx-auto mt-1 mb-3 flex max-w-screen-2xl items-center gap-2 px-1 sm:mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-caption font-medium text-brand-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {category.name} 추천 보는 중
        </span>
        {/* 카테고리 컨텍스트(쿠키) 해제는 반드시 풀 페이지 이동이어야 브라우저가
            미들웨어의 Set-Cookie(쿠키 삭제)를 확실히 반영한다. Next <Link> 클라이언트
            네비는 리다이렉트의 Set-Cookie 가 커밋되지 않아 쿠키가 남고 → 다시 /c/ 로
            튕기며 무한스크롤 없는 페이지에 갇힌다. 그래서 일반 <a> 로 강제 풀 로드. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 쿠키 삭제 반영 위해 의도적 풀 로드 */}
        <a
          href="/?nocat=1"
          className="rounded-full px-2.5 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
        >
          전체 보기 ✕
        </a>
      </div>

      {/* 바로가기 + 무드 — 데스크톱 좌/우 2단. 근거는 홈과 같다((user)/page.tsx).
          무드는 광고 유입에서 렌더하지 않는다 — 클릭한 사진이 두 화면 아래로 밀린다.
          그때는 바로가기만 한 줄로 남는다. */}
      <div className="mb-4 lg:grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <HomeQuickNav />
        {!isAdEntry && <HomeDiscoverySections />}
      </div>

      {/* 아래부터는 전체 피드. 그 머리는 피드의 것이라 여기서 그린다(홈과 같다).
          id 는 '맨 위로' 버튼이 나타날 기준점이기도 하다. */}
      <div id="sec-all-photos" className="mb-2.5 scroll-mt-20 px-1">
        <span aria-hidden className="mb-2 block h-[2px] w-6 bg-brand" />
        <h2 className="text-body font-bold tracking-tight">전체 사진</h2>
      </div>

      {/* 맨 위로 — '전체 사진' 머리를 지나야 나타난다 */}
      <ScrollTopButton anchorId="sec-all-photos" />

      {photos.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="h-7 w-7" />}
          title="아직 이 카테고리의 사진이 없어요"
          description="곧 채워질 예정이에요."
        />
      ) : (
        <ExploreGallery
          photos={photos}
          likedIds={likedIds}
          spotlightId={spotlightId}
          loggedIn={!!me}
          spotlightFirstOnGeneral
          interstitials={interstitials}
        />
      )}

      {/* 지면의 끝 — 홈과 같은 자리다.
          예전엔 피드 **앞**에 있었다. "여기도 무한 스크롤이라 푸터에 못 닿는다"는 이유였는데,
          그 결과 광고로 들어온 사람의 첫 화면 바로 아래에 사업자 정보가 박혔다
          (실측: 푸터 top 422px, 그 아래에 사진 48장). 페이지가 거기서 끝난 것처럼 읽힌다.
          이제 갤러리가 3회에서 멈추고 [사진 더 보기]로 넘기므로 푸터에 닿는다. */}
      <SiteFooter />
    </section>
  );
}
