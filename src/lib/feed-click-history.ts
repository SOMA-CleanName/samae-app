export const FEED_CLICK_HISTORY_KEY = "samae:feed-click-history:v1";

export function appendFeedClick(ids: string[], photoId: string, max = 8): string[] {
  const unique = [...new Set(ids)];
  if (!unique.includes(photoId)) unique.push(photoId);
  return unique.slice(-Math.max(1, max));
}

export function readFeedClicks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(FEED_CLICK_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string"))].slice(-8)
      : [];
  } catch {
    return [];
  }
}

export function recordFeedClick(photoId: string): string[] {
  const next = appendFeedClick(readFeedClicks(), photoId);
  try {
    sessionStorage.setItem(FEED_CLICK_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // 저장소 접근 불가 시 현재 탐색은 정상 동작하고 개인화 신호만 유지되지 않는다.
  }
  return next;
}

export function clearFeedClicks(
  storage: Pick<Storage, "removeItem"> | { removeItem(key: string): void } = sessionStorage
): void {
  try {
    storage.removeItem(FEED_CLICK_HISTORY_KEY);
  } catch {
    // 저장소 접근 불가 시 현재 페이지의 상태 초기화만 수행한다.
  }
}
