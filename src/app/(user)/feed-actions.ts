"use server";

import { cookies } from "next/headers";
import {
  fetchDemotedHomeFeedPage,
  fetchInterestSimilarGroups,
  fetchPersonalizedHomeFeedPage,
  fetchPersonalizedRecommendations,
  fetchRankedDetailRecommendations,
} from "@/lib/discovery";
import type { GalleryPhoto, InterestSimilarGroup } from "@/lib/discovery";
import { INTEREST_RECOMMENDATION_MIN_COUNT } from "@/lib/interest-similar-recommendations";
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
  return fetchPersonalizedHomeFeedPage(
    seed,
    page,
    purposeIds,
    moodIds,
    clickedPhotoIds,
    interestedPhotoIds,
    seenPhotoIds,
    48
  );
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
export async function loadInterestSimilarGroups(
  interestPhotoIds: string[]
): Promise<InterestSimilarGroup[]> {
  const currentInterestIds = [...new Set(interestPhotoIds.filter(Boolean))];
  if (currentInterestIds.length < INTEREST_RECOMMENDATION_MIN_COUNT) return [];
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
