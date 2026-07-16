import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getPublishedExploreCategory,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { MpTrackOnce } from "@/components/MpTrackOnce";

export const dynamic = "force-dynamic";

// Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않음 — 한글 slug 매칭 위해 직접 디코딩
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// 탐색 카테고리 진입 — 운영이 담은 사진을 position 순으로 메이슨리 노출.
export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = await getPublishedExploreCategory(safeDecode(slug));
  if (!cat) notFound();

  const [me, photos] = await Promise.all([
    getCurrentUser(),
    fetchExploreCategoryGalleryPhotos(cat.id),
  ]);

  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <ScrollMemory />
      {/* 카테고리 탐색 진입 — 취향 시그널(수요 차원) */}
      <MpTrackOnce event="View Category" props={{ category: cat.title, result_count: photos.length }} />
      <h1 className="mb-3 px-1 text-xl font-bold tracking-tight">{cat.title}</h1>
      <ExploreGallery photos={photos} loggedIn={!!me} />
    </section>
  );
}
