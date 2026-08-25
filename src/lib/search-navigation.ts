/** 검색창 제출값을 공유·뒤로가기가 가능한 홈 q URL로 바꾼다. */
export function searchHref(rawQuery: string): string {
  const query = rawQuery.trim();
  return query ? `/?q=${encodeURIComponent(query)}` : "/";
}
