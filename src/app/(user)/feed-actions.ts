"use server";

import { fetchSeededFeedPage } from "@/lib/discovery";
import type { GalleryPhoto } from "@/lib/discovery";

// 홈 피드 무한 스크롤 — 클라이언트(ExploreGallery)가 바닥 근처에서 호출.
// seed 는 진입 시 서버가 정해 넘긴 값(세션 내 순서 일관). 빈 배열이면 더 없음(종료).
export async function loadMorePhotos(seed: string, page: number): Promise<GalleryPhoto[]> {
  return (await fetchSeededFeedPage(seed, page)) ?? [];
}
