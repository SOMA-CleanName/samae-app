import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory, isUntaggedCategory } from "@/lib/categories";
import { fetchPhotosByTags, fetchUntaggedPhotos, fetchLikedPhotoIds } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ExploreHeader } from "@/components/user/ExploreHeader";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

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
  const category = await getPublishedCategory(decodedSlug);
  if (!category) notFound();

  const me = await getCurrentUser();
  // 넉넉히 받아 클라이언트가 점진 노출(무한 스크롤) — 탐색 메인과 동일 패턴
  const photos = isUntaggedCategory(category.tags)
    ? await fetchUntaggedPhotos(300)
    : await fetchPhotosByTags(category.tags, 300);
  const likedIds = me ? await fetchLikedPhotoIds(photos.map((p) => p.id), me.id) : [];

  return (
    <section className="px-3 pb-10 font-kr sm:px-5">
      {/* 탐색 메인과 동일한 sticky 검색 헤더 (제목 없이 검색·보기옵션만) */}
      <ExploreHeader />

      {photos.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="h-7 w-7" />}
          title="아직 이 카테고리의 사진이 없어요"
          description="곧 채워질 예정이에요."
        />
      ) : (
        <ExploreGallery photos={photos} likedIds={likedIds} />
      )}
    </section>
  );
}
