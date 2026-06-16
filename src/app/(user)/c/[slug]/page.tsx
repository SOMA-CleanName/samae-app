import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPublishedCategory } from "@/lib/categories";
import { fetchPhotosByTags, fetchLikedPhotoIds } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

// 카테고리 랜딩 — 광고 유입(/c/<slug>?utm_*). 카테고리 태그와 겹치는 사진을 추천순으로.
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getPublishedCategory(slug);
  if (!category) notFound();

  const me = await getCurrentUser();
  const photos = await fetchPhotosByTags(category.tags, 60);
  const likedIds = me ? await fetchLikedPhotoIds(photos.map((p) => p.id), me.id) : [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 font-kr sm:px-6">
      <header className="mb-5">
        <h1 className="text-h1 font-semibold">{category.name}</h1>
        {category.description && (
          <p className="mt-1 text-body-sm text-muted">{category.description}</p>
        )}
      </header>

      {photos.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="h-7 w-7" />}
          title="아직 이 카테고리의 사진이 없어요"
          description="곧 채워질 예정이에요."
        />
      ) : (
        <ExploreGallery photos={photos} likedIds={likedIds} />
      )}
    </main>
  );
}
