export type CartNavigationDirection = "next" | "previous";

export function circularPhotoId(
  ids: string[],
  currentId: string,
  direction: CartNavigationDirection
): string | null {
  if (ids.length < 2) return null;

  const currentIndex = ids.indexOf(currentId);
  if (currentIndex < 0) return ids[0] ?? null;

  const delta = direction === "next" ? 1 : -1;
  return ids[(currentIndex + delta + ids.length) % ids.length] ?? null;
}

// 확대에서 사진 넘기기 — 좌우로 민다. 왼쪽으로 밀면 다음 사진.
// (줄 화면이 이미 가로로 넘기는 화면이라, 확대만 세로면 손이 다시 배워야 한다.)
export function horizontalSwipeDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = 56
): CartNavigationDirection | null {
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "next" : "previous";
}

export function shouldShowCartSwipeHint(photoCount: number, hasSeen: boolean): boolean {
  return photoCount > 1 && !hasSeen;
}

export function cartMetaLabels(priceText: string | null, location: string | null) {
  const normalizedPrice = priceText?.trim() || null;
  const normalizedLocation = location?.trim() || null;
  if (!normalizedPrice && !normalizedLocation) {
    return { primaryText: "가격, 장소 협의", locationText: null };
  }
  return {
    primaryText: normalizedPrice ?? "가격 협의",
    locationText: normalizedLocation ?? "장소 협의",
  };
}

export function reconciledFocusedPhotoId(ids: string[], focusedId: string): string | null {
  if (ids.includes(focusedId)) return focusedId;
  return ids[0] ?? null;
}

// 휠/트랙패드 — 우세한 축을 따른다. 트랙패드는 가로로 밀 수 있지만 휠 마우스는
// 세로밖에 못 돌리므로, 세로 스크롤도 계속 넘기기로 받는다.
export function wheelNavigationDirection(
  deltaX: number,
  deltaY: number,
  deltaMode: number
): CartNavigationDirection | null {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
  const normalizedX = deltaX * unit;
  const normalizedY = deltaY * unit;
  const dominant = Math.abs(normalizedX) > Math.abs(normalizedY) ? normalizedX : normalizedY;
  if (Math.abs(dominant) < 20) return null;
  return dominant > 0 ? "next" : "previous";
}
