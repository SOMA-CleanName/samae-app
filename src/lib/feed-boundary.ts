export type FeedBoundaryKind = "normal-end" | "cycle-end";

export type FeedBoundary = {
  id: string;
  kind: FeedBoundaryKind;
  afterItemCount: number;
};

export type FeedBoundarySegment<T> = {
  items: T[];
  boundary?: FeedBoundary;
};

export function addFeedBoundary(
  boundaries: FeedBoundary[],
  boundary: FeedBoundary
): FeedBoundary[] {
  return boundaries.some((current) => current.id === boundary.id)
    ? boundaries
    : [...boundaries, boundary];
}

export function splitAtFeedBoundaries<T>(
  items: T[],
  boundaries: FeedBoundary[]
): FeedBoundarySegment<T>[] {
  const visibleBoundaries = boundaries
    .filter((boundary) => boundary.afterItemCount <= items.length)
    .sort((left, right) => left.afterItemCount - right.afterItemCount);
  const segments: FeedBoundarySegment<T>[] = [];
  let start = 0;

  for (const boundary of visibleBoundaries) {
    segments.push({
      items: items.slice(start, boundary.afterItemCount),
      boundary,
    });
    start = boundary.afterItemCount;
  }

  if (start < items.length || segments.length === 0) {
    segments.push({ items: items.slice(start) });
  }

  return segments;
}
