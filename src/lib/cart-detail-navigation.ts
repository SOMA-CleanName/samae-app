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

export function verticalSwipeDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = 56
): CartNavigationDirection | null {
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dy) < threshold || Math.abs(dy) <= Math.abs(dx)) return null;
  return dy < 0 ? "next" : "previous";
}

export function shouldShowCartSwipeHint(photoCount: number, hasSeen: boolean): boolean {
  return photoCount > 1 && !hasSeen;
}

export function reconciledFocusedPhotoId(ids: string[], focusedId: string): string | null {
  if (ids.includes(focusedId)) return focusedId;
  return ids[0] ?? null;
}

export function wheelNavigationDirection(
  deltaX: number,
  deltaY: number,
  deltaMode: number
): CartNavigationDirection | null {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1;
  const normalizedX = deltaX * unit;
  const normalizedY = deltaY * unit;
  if (Math.abs(normalizedY) < 20 || Math.abs(normalizedY) <= Math.abs(normalizedX)) return null;
  return normalizedY > 0 ? "next" : "previous";
}
