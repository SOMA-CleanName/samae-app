import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory } from "@/lib/categories";
import { fetchTargetCategoryFeed, fetchLikedPhotoIds, fetchPhotoById } from "@/lib/discovery";
import { resolveTargetPhotoIds } from "@/lib/target-categories";
import type { GalleryPhoto } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { FeedHero } from "@/components/user/FeedHero";
import { ProfileButton } from "@/components/user/ProfileButton";
import { toProfileMe } from "@/lib/profile-me";
import { HomeBannerSlot } from "@/components/user/HomeBannerSlot";
import { SiteLinksRow } from "@/components/user/SiteLinksRow";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";
import type { Metadata } from "next";
import { categoryMetadata } from "@/lib/seo";

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

  return (
    // 지면 폭 상한 — 홈과 같은 이유·같은 값. (근거는 (user)/page.tsx 주석)
    <section className="mx-auto max-w-screen-2xl px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <ScrollMemory />
      {/* 소개글 → 배너. 홈과 같은 순서로 맞춘다 */}
      {/* 계정 진입도 홈과 같은 자리에. 이 지면은 하단 내비에서 '홈' 으로 잡히는데
          여기만 프로필 버튼이 없으면 계정에 닿을 길이 사라진다(좌하단 아바타를 없앴다). */}
      <FeedHero
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-caption font-medium text-brand">
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

      {/* 여기도 무한 스크롤이라 푸터에 못 닿는다 — 피드 시작 전에 안내 링크 (홈과 같은 이유) */}
      <SiteLinksRow />

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
        />
      )}
    </section>
  );
}
