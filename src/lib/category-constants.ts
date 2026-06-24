// 카테고리 공용 상수 (서버/클라 공용 — server-only 아님)

// 광고 유입 시 어떤 카테고리 알고리즘을 보고 있는지 유지하는 쿠키 이름.
// proxy(미들웨어)가 set/clear 하고, 메인 페이지가 읽어 피드를 카테고리화한다.
export const CATEGORY_COOKIE = "samae_cat";

// 임시: '태그 없는 사진'을 한 카테고리로 묶기 위한 센티넬 태그.
// 이 토큰이 카테고리 tags 에 있으면 일반 태그 매칭 대신 mood_tags 가 빈 사진을 매칭한다.
export const UNTAGGED_TOKEN = "__untagged__";

export function isUntaggedCategory(tags: string[]): boolean {
  return tags.includes(UNTAGGED_TOKEN);
}
