import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getPublishedExploreCategory,
  fetchExploreCategoryGalleryPhotos,
} from "@/lib/explore-db";
import { newFeedSeed, fetchLikedPhotoIds } from "@/lib/discovery";
import { seededShuffle } from "@/lib/seeded-shuffle";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { CategoryImmersive } from "./CategoryImmersive";

export const dynamic = "force-dynamic";

// Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않음 — 한글 slug 매칭 위해 직접 디코딩
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// 탐색 카테고리 진입 — 홈 그리드가 아니라 '풀스크린 몰입 + 하단 필름스트립'으로.
// 요청마다 셔플(한 세션 순서는 CategoryImmersive 내부 상태로 유지되진 않으나 force-dynamic 이라 진입마다 변주).
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
  const photos = seededShuffle(ordered, newFeedSeed());
  // 좋아요 초기 상태(로그인=DB, 비로그인=쿠키) — 하트 채움 표시용
  const likedIds = await fetchLikedPhotoIds(
    photos.map((p) => p.id),
    me?.id
  );

  return (
    <>
      {/* 카테고리 탐색 진입 — 취향 시그널(수요 차원) */}
      <MpTrackOnce
        event="View Category"
        props={{ category: cat.title, slug: cat.slug, result_count: photos.length }}
      />
      <CategoryImmersive photos={photos} title={cat.title} initialLiked={likedIds} />
    </>
  );
}
