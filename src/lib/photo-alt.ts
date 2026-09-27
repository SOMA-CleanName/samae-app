// 사진의 대체 텍스트(alt).
//
// 지금은 `"사진"` · `"사진 1/3"` 이다. 화면 낭독기에게도 검색엔진에게도 **아무 정보가
// 아니다.** 구글 이미지가 "이게 무슨 사진인가" 를 판단하는 근거가 alt·주변 텍스트·
// 파일명인데, 우리는 셋 다 비어 있다(파일명은 UUID).
//
// ⚠️ **긴 문장을 넣으면 안 된다.** alt 는 "이 이미지가 뭔지" 를 짧게 말하는 칸이고,
//    문단을 밀어넣으면 구글이 스팸으로 본다. 한 줄이면 충분하다.
//
// ⚠️ **작가 이름은 넣지 않는다** — 익명 정책. 기존 altFor 에도 그렇게 적혀 있다.
//
// ⚠️ **없는 사실을 만들지 않는다.** 장소가 「협의」면 장소를 말하지 않고(lib/location-text),
//    무드가 없으면 무드를 말하지 않는다. 아무것도 없으면 그냥 "스냅 사진" 이다.

import { displayPlace } from "./location-text";

export type PhotoAltInput = {
  region?: string | null;
  location_text?: string | null;
  mood_tags?: string[] | null;
};

/** 무드는 둘까지만 — 태그를 나열하면 문장이 아니라 목록이 된다 */
const MAX_MOODS = 2;

/**
 * 한 장의 alt. 있는 것만 말한다.
 *
 *   장소 + 무드 → "을지로 골목에서 찍은 필름 · 감성 무드 스냅 사진"
 *   장소만      → "을지로 골목에서 찍은 스냅 사진"
 *   무드만      → "필름 무드 스냅 사진"
 *   아무것도 없음 → "스냅 사진"
 */
export function photoAlt(photo: PhotoAltInput): string {
  const place = displayPlace(photo.location_text) ?? photo.region?.trim() ?? null;
  const moods = (photo.mood_tags ?? [])
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, MAX_MOODS)
    .join(" · ");

  const head = place ? `${place}에서 찍은 ` : "";
  const mid = moods ? `${moods} 무드 ` : "";
  return `${head}${mid}스냅 사진`;
}

/**
 * 여러 장을 함께 보여줄 때. **몇 번째인지는 alt 에 넣지 않는다** — "사진 2/5" 는
 * 이미지의 내용이 아니라 화면의 사정이고, 검색엔진에도 낭독기에도 쓸모가 없다.
 * 대신 같은 묶음이면 같은 설명이 나가도 된다(실제로 같은 촬영이다).
 */
export function photoAltAt(photos: readonly PhotoAltInput[], index: number): string {
  const p = photos[index];
  return p ? photoAlt(p) : "스냅 사진";
}
