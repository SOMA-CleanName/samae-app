import {
  fetchPublishedPhotos,
  searchPhotosByTag,
  fetchLikedPhotoIds,
  fetchPhotoById,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { ExploreHeader } from "@/components/user/ExploreHeader";
import type { GalleryPhoto } from "@/lib/discovery";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; ad?: string };

export default async function ExploreHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();

  // 광고 유입 온보딩 — URL ?ad=<사진ID>(광고 크리에이티브 사진)가 있을 때만,
  // 그 사진을 좌상단 첫 카드로 고정하고 스포트라이트로 서비스 소개. (검색 모드 아닐 때)
  const adPhoto = !query && sp.ad ? await fetchPhotoById(sp.ad) : null;

  // 검색 모드: 태그로 사진 검색 / 기본 모드: 셔플된 전체 풀(클라이언트가 점진 노출)
  const basePhotos = query
    ? await searchPhotosByTag(query)
    : await fetchPublishedPhotos({});

  // 광고 사진을 맨 앞으로 → 메이슨리 좌상단 첫 카드 = 광고 이미지
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
  const photos = adAsGallery
    ? [adAsGallery, ...basePhotos.filter((p) => p.id !== adAsGallery.id)]
    : basePhotos;
  const spotlightId = adAsGallery?.id;

  // 현재 사용자가 좋아요한 사진(갤러리 하트 초기 상태)
  const me = await getCurrentUser();
  const likedIds = await fetchLikedPhotoIds(
    photos.map((p) => p.id),
    me?.id
  );

  return (
    <section className="px-3 pb-10 font-kr sm:px-5">
      <ExploreHeader />
      <ExploreGallery photos={photos} query={query} likedIds={likedIds} spotlightId={spotlightId} />
    </section>
  );
}
