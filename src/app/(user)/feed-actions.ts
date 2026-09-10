"use server";

import { cookies } from "next/headers";
import { rerankByPersonaVector } from "@/lib/persona/feed-rerank";
import {
  fetchDemotedHomeFeedPage,
  fetchInterestSimilarGroups,
  fetchPersonalizedHomeFeedPage,
  fetchPersonalizedRecommendations,
  fetchRankedDetailRecommendations,
} from "@/lib/discovery";
import type { GalleryPhoto, InterestSimilarGroup } from "@/lib/discovery";
import { TASTE_V2_COOKIE, parseTasteV2 } from "@/lib/category-constants";

// 홈 피드 무한 스크롤 — 클라이언트(ExploreGallery)가 바닥 근처에서 호출.
// seed 는 진입 시 서버가 정해 넘긴 값(세션 내 순서 일관). 한 사이클이 끝나면 클라이언트가
// 파생 seed 로 page 0부터 다시 요청해 기존 사진을 새 순서로 계속 노출한다.
// 취향 v2(samae_taste2)가 있으면 전역 티어링(목적∩무드 → 목적만 → 무드만 → 일반)으로 노출.
export async function loadMorePhotos(
  seed: string,
  page: number,
  clickedPhotoIds: string[] = [],
  interestedPhotoIds: string[] = [],
  seenPhotoIds: string[] = []
): Promise<GalleryPhoto[]> {
  const { purposeIds, moodIds } = parseTasteV2((await cookies()).get(TASTE_V2_COOKIE)?.value);
  const photos = await fetchPersonalizedHomeFeedPage(
    seed,
    page,
    purposeIds,
    moodIds,
    clickedPhotoIds,
    interestedPhotoIds,
    seenPhotoIds,
    48
  );
  // 페르소나 방문자면 페이지 안 순서를 시각 유사도순으로 (0080, 실패 무해)
  return rerankByPersonaVector(photos);
}

export async function loadPersonalizedPhotos(
  clickedPhotoIds: string[],
  interestedPhotoIds: string[],
  excludedPhotoIds: string[]
): Promise<GalleryPhoto[]> {
  return fetchPersonalizedRecommendations(clickedPhotoIds, interestedPhotoIds, excludedPhotoIds, 36);
}

// 관심사진 화면의 '비슷한 사진' — 앵커별 묶음으로 돌려준다.
// 합치지 않는 이유는 discovery.fetchInterestSimilarGroups 주석 참조.
//
// 최소 장수를 두지 않는다. 예전에는 관심사진 전체를 자동으로 앵커 삼았기 때문에
// "충분히 쌓였을 때만" 이라는 기준(4장)이 필요했지만, 지금은 사용자가 추천받을
// 사진을 직접 고른다. 한 장을 고른 것도 "이 사진과 비슷한 걸 보여줘" 라는 분명한 요청이다.
export async function loadInterestSimilarGroups(
  interestPhotoIds: string[]
): Promise<InterestSimilarGroup[]> {
  const currentInterestIds = [...new Set(interestPhotoIds.filter(Boolean))];
  if (currentInterestIds.length === 0) return [];
  return fetchInterestSimilarGroups(currentInterestIds, 100);
}

export async function loadDemotedHomePhotos(
  seed: string,
  page: number
): Promise<GalleryPhoto[]> {
  return fetchDemotedHomeFeedPage(seed, page, 48);
}

export async function loadRankedDetailPhotos(
  clickedPhotoIds: string[]
) {
  return fetchRankedDetailRecommendations(clickedPhotoIds, 120);
}
