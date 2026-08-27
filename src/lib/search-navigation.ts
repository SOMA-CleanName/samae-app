/** 검색창 제출값을 공유·뒤로가기가 가능한 홈 q URL로 바꾼다. */
export function searchHref(rawQuery: string): string {
  const query = rawQuery.trim();
  return query ? `/?q=${encodeURIComponent(query)}` : "/";
}

/** 같은 pathname 안에서도 검색어별 스크롤·피드 세션을 분리하는 정규 키. */
export function routeSessionKey(
  pathname: string,
  rawQuery: string | null | undefined
): string {
  const query = rawQuery?.trim();
  return query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname;
}

export const SEARCH_FEED_SESSION_SCHEMA = "search-relevance-masonry-v5";

/** 검색을 끝낼 때 같은 검색어로 다시 들어가도 이전 결과·위치가 복원되지 않게 지울 키. */
export function searchSessionStorageKeys(
  pathname: string,
  rawQuery: string | null | undefined
): string[] {
  if (!rawQuery?.trim()) return [];
  const routeKey = routeSessionKey(pathname, rawQuery);
  return [
    `samae:scroll:${routeKey}`,
    `samae:scroll-anchor:${routeKey}`,
    `samae:gallery-session:${SEARCH_FEED_SESSION_SCHEMA}:${routeKey}`,
  ];
}

export type HomeNavMode = "leave-search" | "refresh-home" | "open-home";

/** 홈 탭 클릭이 검색 종료인지, 현재 홈 새로고침인지, 일반 홈 이동인지 구분한다. */
export function homeNavMode(pathname: string, rawQuery: string | null): HomeNavMode {
  if (pathname === "/" && rawQuery?.trim()) return "leave-search";
  if (pathname === "/" || pathname.startsWith("/c/")) return "refresh-home";
  return "open-home";
}
