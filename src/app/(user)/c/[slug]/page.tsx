import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory, isUntaggedCategory } from "@/lib/categories";
import { fetchCategoryFeed, fetchLikedPhotoIds, fetchPhotoById } from "@/lib/discovery";
import type { GalleryPhoto } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { FeedHero } from "@/components/user/FeedHero";
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
  const [adPhoto, base] = await Promise.all([
    spotlightPhotoId ? fetchPhotoById(spotlightPhotoId) : Promise.resolve(null),
    fetchCategoryFeed(
      category.tags,
      isUntaggedCategory(category.tags),
      category.orderedPhotoIds
    ),
  ]);

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
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <FeedHero />

      {/* 카테고리 추천 보는 중 + 전체 보기 해제(쿠키도 해제됨 → /?nocat=1) */}
      <div className="mx-auto mt-1 mb-3 flex max-w-screen-2xl items-center gap-2 px-1 sm:mb-4">
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
