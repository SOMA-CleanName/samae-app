import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getPublishedExploreCategory,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";
import { newFeedSeed } from "@/lib/discovery";
import { seededShuffle } from "@/lib/seeded-shuffle";
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

// 탐색 카테고리 진입 — 담은 사진을 메인 피드처럼 랜덤(요청마다 셔플)으로 노출.
// ExploreGallery 가 세션(sessionStorage)에 순서를 캐시하므로 한 세션 안에선 순서 유지.
export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = await getPublishedExploreCategory(safeDecode(slug));
  if (!cat) notFound();

  const [me, ordered] = await Promise.all([
    getCurrentUser(),
    fetchExploreCategoryGalleryPhotos(cat.id),
  ]);
  // 메인과 같게 랜덤 — 요청마다 새 시드로 셔플. (position 순 노출 안 함)
  const photos = seededShuffle(ordered, newFeedSeed());

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
