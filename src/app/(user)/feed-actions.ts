"use server";

import { cookies } from "next/headers";
import { fetchSeededFeedPage } from "@/lib/discovery";
import type { GalleryPhoto } from "@/lib/discovery";
import { TASTE_V2_COOKIE, parseTasteV2 } from "@/lib/category-constants";
import { scoreTastePhotos, boostByTaste } from "@/lib/explore-db";

// 홈 피드 무한 스크롤 — 클라이언트(ExploreGallery)가 바닥 근처에서 호출.
// seed 는 진입 시 서버가 정해 넘긴 값(세션 내 순서 일관). 빈 배열이면 더 없음(종료).
// 취향 v2(samae_taste2)가 있으면 페이지 내에서 목적/무드 멤버십으로 가중랜덤 부스트(뭉침 없음).
export async function loadMorePhotos(seed: string, page: number): Promise<GalleryPhoto[]> {
  const { purposeIds, moodIds } = parseTasteV2((await cookies()).get(TASTE_V2_COOKIE)?.value);
  const catIds = [...purposeIds, ...moodIds];
  const base = (await fetchSeededFeedPage(seed, page, 48)) ?? [];
  if (catIds.length === 0 || base.length === 0) return base;
  const score = await scoreTastePhotos(
    base.map((p) => p.id),
    catIds
  );
  return boostByTaste(base, score, seed);
}
