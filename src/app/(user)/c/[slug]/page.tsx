import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory, isUntaggedCategory } from "@/lib/categories";
import { fetchCategoryFeed, fetchLikedPhotoIds } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { FeedHero } from "@/components/user/FeedHero";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";
import type { Metadata } from "next";
import { categoryMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

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

// 카테고리 랜딩 — 광고 유입(/c/<slug>?utm_*). 카테고리 태그와 겹치는 사진을 추천순으로.
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않음 — 한글 slug 매칭 위해 직접 디코딩
  const decodedSlug = safeDecode(slug);
  // 카테고리·로그인유저 병렬(서로 독립)
  const [category, me] = await Promise.all([getPublishedCategory(decodedSlug), getCurrentUser()]);
  if (!category) notFound();

  // 카테고리 매칭 사진 먼저 + 나머지 전체 → 무한스크롤로 결국 모든 사진 노출
  const photos = await fetchCategoryFeed(category.tags, isUntaggedCategory(category.tags));
  const likedIds = me ? await fetchLikedPhotoIds(photos.map((p) => p.id), me.id) : [];

  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <FeedHero />
      {photos.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="h-7 w-7" />}
          title="아직 이 카테고리의 사진이 없어요"
          description="곧 채워질 예정이에요."
        />
      ) : (
        <ExploreGallery photos={photos} likedIds={likedIds} loggedIn={!!me} spotlightFirstOnGeneral />
      )}
    </section>
  );
}
