// 카테고리 공용 상수 (서버/클라 공용 — server-only 아님)

// 광고 유입 시 어떤 카테고리 알고리즘을 보고 있는지 유지하는 쿠키 이름.
// proxy(미들웨어)가 set/clear 하고, 메인 페이지가 읽어 피드를 카테고리화한다.
export const CATEGORY_COOKIE = "samae_cat";

// 취향 테스트 결과(태그)를 담는 쿠키 — (구) mood_tags 기반. v2 로 대체 예정.
// 값: 태그를 콤마로 이은 문자열. 퀴즈 완료 시 set, 초기화 시 clear.
export const TASTE_COOKIE = "samae_taste";

// 취향 테스트 v2 — 카테고리 기반(목적 + 무드). 값 형식: "p:<id>,<id>|m:<id>,<id>".
// 홈 피드가 이 목적/무드 카테고리 멤버십으로 개인화한다.
export const TASTE_V2_COOKIE = "samae_taste2";

// v2 쿠키 파싱/직렬화 — { purposeIds, moodIds }.
export function parseTasteV2(raw: string | undefined): { purposeIds: string[]; moodIds: string[] } {
  const out = { purposeIds: [] as string[], moodIds: [] as string[] };
  if (!raw) return out;
  for (const part of raw.split("|")) {
    const [k, v] = part.split(":");
    const ids = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (k === "p") out.purposeIds = ids;
    else if (k === "m") out.moodIds = ids;
  }
  return out;
}

export function serializeTasteV2(purposeIds: string[], moodIds: string[]): string {
  return `p:${purposeIds.join(",")}|m:${moodIds.join(",")}`;
}

// 임시: '태그 없는 사진'을 한 카테고리로 묶기 위한 센티넬 태그.
// 이 토큰이 카테고리 tags 에 있으면 일반 태그 매칭 대신 mood_tags 가 빈 사진을 매칭한다.
export const UNTAGGED_TOKEN = "__untagged__";

export function isUntaggedCategory(tags: string[]): boolean {
  return tags.includes(UNTAGGED_TOKEN);
}
