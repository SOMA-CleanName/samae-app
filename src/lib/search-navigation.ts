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

// 검색 결과를 만드는 방식이 바뀌면 올린다. 갤러리는 같은 탭에서 했던 검색 결과를 저장해 뒀다가
// 같은 검색어로 돌아오면 서버가 새로 보낸 결과 대신 그걸 되살린다 — 안 올리면 옛 결과가 계속 뜬다.
// v6: 검색어에서 목적을 떼어 필터로 쓴다 (docs/29 §12).
export const SEARCH_FEED_SESSION_SCHEMA = "search-relevance-masonry-v6";

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

/** 재시도한 응답 위에 이전 검색 사진·스크롤이 복원되지 않게 이 검색의 캐시만 비운다. */
export function clearSearchSession(storage: Pick<Storage, "removeItem">, query: string): void {
  try {
    searchSessionStorageKeys("/", query).forEach((key) => storage.removeItem(key));
  } catch {
    // 저장소 사용이 차단돼 있어도 일반 GET 재시도는 계속한다.
  }
}

/** 홈 탭 클릭이 검색 종료인지, 현재 홈 새로고침인지, 일반 홈 이동인지 구분한다. */
export function homeNavMode(pathname: string, rawQuery: string | null): HomeNavMode {
  if (pathname === "/" && rawQuery?.trim()) return "leave-search";
  if (pathname === "/" || pathname.startsWith("/c/")) return "refresh-home";
  return "open-home";
}
