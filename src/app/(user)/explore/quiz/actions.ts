"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  TASTE_COOKIE,
  TASTE_V2_COOKIE,
  serializeTasteV2,
} from "@/lib/category-constants";
import {
  fetchQuizDeckForPurposes,
  deriveMoodCategories,
  fetchTasteCurated,
  type QuizDeckPhoto,
  type TasteCat,
} from "@/lib/explore-db";

export type { QuizDeckPhoto, TasteCat };
export type TasteResult = { moods: TasteCat[]; photos: QuizDeckPhoto[] };

// 1단계에서 고른 목적 카테고리의 스와이프 덱(앨범당 1장, 셔플).
export async function loadQuizDeck(purposeIds: string[]): Promise<QuizDeckPhoto[]> {
  const clean = [...new Set(purposeIds.filter(Boolean))].slice(0, 3);
  return fetchQuizDeckForPurposes(clean, 12);
}

// 스와이프 종료 — 좋아요한 사진으로 무드 카테고리 산출 + 결과 큐레이션.
// (쿠키 저장은 안 함 — CTA(applyTasteV2)를 눌러야만 취향 적용)
export async function finishTaste(
  purposeIds: string[],
  likedPhotoIds: string[]
): Promise<TasteResult> {
  const purposes = [...new Set(purposeIds.filter(Boolean))].slice(0, 3);
  const liked = [...new Set(likedPhotoIds.filter(Boolean))];
  const moods = await deriveMoodCategories(liked, 3);
  const photos = await fetchTasteCurated(
    purposes,
    moods.map((m) => m.id),
    12
  );
  return { moods, photos };
}

// 취향 적용 — v2 쿠키 저장(익명 포함, 30일). 구 mood_tags 쿠키는 제거.
export async function applyTasteV2(purposeIds: string[], moodIds: string[]): Promise<void> {
  const purposes = [...new Set(purposeIds.filter(Boolean))].slice(0, 3);
  const moods = [...new Set(moodIds.filter(Boolean))].slice(0, 3);
  const store = await cookies();
  store.delete(TASTE_COOKIE); // 구 취향 제거(충돌 방지)
  if (purposes.length === 0 && moods.length === 0) {
    store.delete(TASTE_V2_COOKIE);
    return;
  }
  store.set(TASTE_V2_COOKIE, serializeTasteV2(purposes, moods), {
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
