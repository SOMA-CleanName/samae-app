// ShootPersona → samae_taste2 쿠키 값. 결과 후 홈 피드가 이 값을 읽어 자동 개인화한다.
// (새 추천 로직 0 — 기존 taste v2 자산 재사용)
import "server-only";
import { serializeTasteV2, TASTE_V2_COOKIE } from "@/lib/category-constants";
import { purposeByKey } from "@/lib/taste-purposes";
import { resolveCategoryIdsBySlugs } from "@/lib/explore-db";
import type { ShootPersona } from "@/lib/persona/shoot-schema";

export { TASTE_V2_COOKIE };

/**
 * 촬영 페르소나를 taste v2 쿠키 문자열로 직렬화.
 * - purposeKey: 그대로
 * - purposeIds: 목적의 참조 카테고리 슬러그 → 카테고리 id 해석 (기존 로직 재사용)
 * - moodIds: Stage2가 검증한 무드 카테고리 id 그대로
 */
export async function shootPersonaToTasteCookie(shoot: ShootPersona): Promise<string> {
  const purpose = purposeByKey(shoot.purposeKey);
  const purposeIds = purpose ? await resolveCategoryIdsBySlugs(purpose.categorySlugs) : [];
  return serializeTasteV2(shoot.purposeKey, purposeIds, shoot.moodIds);
}
