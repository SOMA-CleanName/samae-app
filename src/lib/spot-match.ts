// 촬영 장소 키워드 매칭 — 사진의 `location_text` 가 이 장소를 가리키는가.
//
// 원래는 DB 가 했다: `location_text ilike '%키워드%'` 를 장소마다 하나씩(lib/spots fetchMatched).
// 앞에 `%` 가 붙은 ilike 는 인덱스를 못 타서 매번 photos 를 통째로 훑는다. 2026-10-06 이 쿼리가
// DB 시간의 77% 를 먹고 사이트를 3시간 멈췄다. 이제는 06:00 에 만들어 두는 공개 사진 목록
// (search_tag_snapshot)을 메모리에서 훑는다 — 같은 판정을 여기서 한다.
//
// `server-only` 인 lib/spots 에서 떼어 둔 건 테스트 때문이다. 틀리기 쉬운 건 DB 가 아니라
// "ilike 와 같은 뜻인가" 다 (lib/random-pick 과 같은 방식).

/**
 * 매칭에 쓸 키워드. 콤마·괄호가 든 키워드는 PostgREST `or` 필터를 깨서 DB 경로에서도 빠진다 —
 * 두 경로가 같은 사진을 고르도록 여기서도 똑같이 뺀다.
 */
export function usableSpotKeywords(keywords: string[]): string[] {
  return keywords.filter((k) => k.trim().length > 0 && !/[,()]/.test(k));
}

/**
 * `location_text ilike '%키워드%'` 와 같은 판정 — 대소문자를 무시한 포함 여부.
 * 키워드가 여럿이면 하나만 걸려도 된다(DB 에서도 or 로 묶었다).
 *
 * ⚠️ ilike 에서 `%`·`_` 는 와일드카드지만 여기선 글자 그대로다. 장소 키워드는 지명이라
 *    그 글자가 들어갈 일이 없어 맞추지 않는다.
 */
export function locationMatchesSpot(
  text: string | null | undefined,
  keywords: string[]
): boolean {
  if (!text) return false;
  const hay = text.toLowerCase();
  return usableSpotKeywords(keywords).some((k) => hay.includes(k.toLowerCase()));
}
