"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  TASTE_COOKIE,
  TASTE_V2_COOKIE,
  serializeTasteV2,
} from "@/lib/category-constants";
import { purposeByKey } from "@/lib/taste-purposes";
import {
  resolveCategoryIdsBySlugs,
  listMoodDeckForPurpose,
  fetchMoodTitles,
  fetchTasteCurated,
  type QuizDeckPhoto,
  type MoodCard,
  type TasteCat,
} from "@/lib/explore-db";

// "use server" 파일은 async 함수만 export 가능 — 타입은 여기서 export 하지 않는다.
// (클라이언트는 이 타입들을 @/lib/explore-db 에서 직접 import)
type TasteResult = { moods: TasteCat[]; photos: QuizDeckPhoto[] };

// 고른 목적(고정 목록)이 참조하는 탐색 카테고리 id.
async function purposeCategoryIds(purposeKey: string): Promise<string[]> {
  const p = purposeByKey(purposeKey);
  if (!p) return [];
  return resolveCategoryIdsBySlugs(p.categorySlugs);
}

// 2단계 덱 — 고른 목적의 무드 대표 사진들(하나씩 스와이프). 목적마다 사진이 다르다.
export async function loadMoodDeck(purposeKey: string): Promise<MoodCard[]> {
  return listMoodDeckForPurpose(purposeKey);
}

// 스와이프 종료 — 좋아요한 무드(id) 그대로 취향. 목적∩무드로 결과 큐레이션.
// (쿠키 저장은 안 함 — CTA(applyTasteV2)를 눌러야만 취향 적용)
export async function finishTaste(
  purposeKey: string,
  likedMoodIds: string[]
): Promise<TasteResult> {
  const purposeIds = await purposeCategoryIds(purposeKey);
  const moodIds = [...new Set(likedMoodIds.filter(Boolean))];
  const [moods, photos] = await Promise.all([
    fetchMoodTitles(moodIds),
    fetchTasteCurated(purposeIds, moodIds, 12),
  ]);
  return { moods, photos };
}

// 취향 적용 — v2 쿠키 저장(익명 포함, 30일). 구 mood_tags 쿠키는 제거.
export async function applyTasteV2(purposeKey: string, moodIds: string[]): Promise<void> {
  const purposeIds = await purposeCategoryIds(purposeKey);
  const moods = [...new Set(moodIds.filter(Boolean))];
  const store = await cookies();
  store.delete(TASTE_COOKIE); // 구 취향 제거(충돌 방지)
  if (purposeIds.length === 0 && moods.length === 0) {
    store.delete(TASTE_V2_COOKIE);
    return;
  }
  store.set(TASTE_V2_COOKIE, serializeTasteV2(purposeKey, purposeIds, moods), {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
}

// 취향 초기화 — v2/구 쿠키 모두 삭제 후 홈 재검증.
export async function clearTaste(): Promise<void> {
  const store = await cookies();
  store.delete(TASTE_V2_COOKIE);
  store.delete(TASTE_COOKIE);
  revalidatePath("/");
}
