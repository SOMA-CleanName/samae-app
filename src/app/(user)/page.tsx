import {
  fetchPublishedPhotosPage,
  searchPhotosByTag,
  fetchLikedPhotoIds,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ExploreHeader } from "@/components/user/ExploreHeader";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export default async function ExploreHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();

  // 검색 모드: 태그로 사진 검색 / 기본 모드: 전체 published 최신순(첫 페이지, 이후 무한스크롤)
  const photos = query
    ? await searchPhotosByTag(query)
    : await fetchPublishedPhotosPage({ offset: 0 });

  // 현재 사용자가 좋아요한 사진(갤러리 하트 초기 상태)
  const me = await getCurrentUser();
  const likedIds = await fetchLikedPhotoIds(
    photos.map((p) => p.id),
    me?.id
  );

  return (
    <section className="px-3 pb-10 font-kr sm:px-5">
      <ExploreHeader />
      <ExploreGallery photos={photos} query={query} likedIds={likedIds} />
    </section>
  );
}
