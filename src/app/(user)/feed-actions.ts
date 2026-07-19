"use server";

import { cookies } from "next/headers";
import { fetchHomeFeedPage } from "@/lib/discovery";
import type { GalleryPhoto } from "@/lib/discovery";
import { TASTE_V2_COOKIE, parseTasteV2 } from "@/lib/category-constants";

// 홈 피드 무한 스크롤 — 클라이언트(ExploreGallery)가 바닥 근처에서 호출.
// seed 는 진입 시 서버가 정해 넘긴 값(세션 내 순서 일관). 빈 배열이면 더 없음(종료).
// 취향 v2(samae_taste2)가 있으면 전역 티어링(목적∩무드 → 목적만 → 무드만 → 일반)으로 노출.
export async function loadMorePhotos(seed: string, page: number): Promise<GalleryPhoto[]> {
  const { purposeIds, moodIds } = parseTasteV2((await cookies()).get(TASTE_V2_COOKIE)?.value);
  return fetchHomeFeedPage(seed, page, purposeIds, moodIds, 48);
}
