import { after } from "next/server";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { SearchResultsHead } from "@/components/user/SearchResultsHead";
import { SearchUnavailable } from "@/components/user/SearchUnavailable";
import { SearchResultsResolved } from "@/components/user/SearchResultsFrame";
import { getCurrentUser } from "@/lib/auth";
import { fetchLikedPhotoIds, searchPhotosByTag } from "@/lib/discovery";
import { resolvePhotoSearch } from "@/lib/photo-search-state";
import { logSearch } from "@/lib/search-log";
import { diversifySearchResults, searchPhotosBySiglip, SIGLIP_SEARCH_MAX_RESULTS } from "@/lib/siglip-text-search";
import { loadMorePhotos, loadPersonalizedPhotos } from "./feed-actions";

/** 검색창은 먼저 렌더하고 사진 결과 준비만 이 경계에서 기다린다. */
export async function SearchPhotoResults({ query }: { query: string }) {
  const result = await resolvePhotoSearch(async (signal) => {
    const [metadata, vector, me] = await Promise.all([
      searchPhotosByTag(query, { directOnly: true, limit: SIGLIP_SEARCH_MAX_RESULTS, signal, failOnError: true }),
      searchPhotosBySiglip(query, SIGLIP_SEARCH_MAX_RESULTS, signal),
      getCurrentUser(),
    ]);
    const photos = diversifySearchResults(query, metadata, vector, SIGLIP_SEARCH_MAX_RESULTS);
    const likedIds = await fetchLikedPhotoIds(photos.map((photo) => photo.id), me?.id, signal);
    return { photos, likedIds, profileId: me?.id };
  });

  if (result.status === "unavailable") return (
    <SearchResultsResolved><SearchUnavailable query={query} /></SearchResultsResolved>
  );

  const { photos, likedIds, profileId } = result.data;
  // 로깅 지연은 결과 표시를 막지 않는다. 장애를 정상 검색 0건으로 기록하지 않는다.
  after(() => logSearch(query, photos.length, profileId));
  return (
    <SearchResultsResolved>
      <SearchResultsHead query={query} count={photos.length} capped={photos.length >= SIGLIP_SEARCH_MAX_RESULTS} />
      <ExploreGallery
        photos={photos}
        query={query}
        likedIds={likedIds}
        loggedIn={!!profileId}
        spotlightFirstOnGeneral
        loadMore={loadMorePhotos}
        loadPersonalized={loadPersonalizedPhotos}
      />
    </SearchResultsResolved>
  );
}
