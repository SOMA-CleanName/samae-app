// 카테고리 공용 상수 (서버/클라 공용 — server-only 아님)

// 임시: '태그 없는 사진'을 한 카테고리로 묶기 위한 센티넬 태그.
// 이 토큰이 카테고리 tags 에 있으면 일반 태그 매칭 대신 mood_tags 가 빈 사진을 매칭한다.
export const UNTAGGED_TOKEN = "__untagged__";

export function isUntaggedCategory(tags: string[]): boolean {
  return tags.includes(UNTAGGED_TOKEN);
}
