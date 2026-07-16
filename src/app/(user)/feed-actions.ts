"use server";

import { cookies } from "next/headers";
import { fetchSeededFeedPage } from "@/lib/discovery";
import type { GalleryPhoto } from "@/lib/discovery";
import { TASTE_COOKIE } from "@/lib/category-constants";

// 홈 피드 무한 스크롤 — 클라이언트(ExploreGallery)가 바닥 근처에서 호출.
// seed 는 진입 시 서버가 정해 넘긴 값(세션 내 순서 일관). 빈 배열이면 더 없음(종료).
// 취향 쿠키(samae_taste)가 있으면 취향순 랭킹으로 이어받아 페이지가 일관되게 유지된다.
export async function loadMorePhotos(seed: string, page: number): Promise<GalleryPhoto[]> {
  const raw = (await cookies()).get(TASTE_COOKIE)?.value;
  const tags = raw ? raw.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  return (await fetchSeededFeedPage(seed, page, 48, tags)) ?? [];
}
