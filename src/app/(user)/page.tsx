import {
  fetchPublishedPhotos,
  searchPhotosByTag,
} from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export default async function ExploreHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim();

  // 검색 모드: 태그로 사진 검색 / 기본 모드: 전체 published 최신순
  const photos = query
    ? await searchPhotosByTag(query)
    : await fetchPublishedPhotos({});

  return (
    <section className="px-3 pb-10 font-kr sm:px-5">
      <ExploreGallery photos={photos} query={query} />
    </section>
  );
}
