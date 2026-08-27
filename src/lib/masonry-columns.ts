export type MasonryPhoto = {
  id: string;
  width: number;
  height: number;
  album_id?: string | null;
  albumId?: string | null;
};

export type PositionedMasonryPhoto<T> = {
  id: string;
  photo: T;
  feedIndex: number;
};

type InternalPosition<T> = PositionedMasonryPhoto<T> & {
  albumKey: string;
  nonPortrait: boolean;
  start: number;
  end: number;
};

export type MasonryLayoutOptions = {
  disperseNonPortrait?: boolean;
};

// 단위 열 너비 기준 반 장 이상 높이가 벌어지면 앨범 분산보다 짧은 열을 우선한다.
// 분산 점수가 한쪽 열에 사진을 계속 쌓아 큰 빈 공간을 만드는 것을 막는 안전 한계다.
const HEIGHT_BALANCE_SLACK = 0.5;

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): number {
  return Math.max(0, Math.min(end, otherEnd) - Math.max(start, otherStart));
}

/** 관련도 순서를 유지하면서 같은 앨범의 화면상 좌우 겹침을 피하는 메이슨리 배치. */
export function buildDiverseMasonryColumns<T extends MasonryPhoto>(
  photos: T[],
  columnCount: number,
  options: MasonryLayoutOptions = {}
): PositionedMasonryPhoto<T>[][] {
  const safeColumnCount = Math.max(1, Math.floor(columnCount));
  const columns: InternalPosition<T>[][] = Array.from(
    { length: safeColumnCount },
    () => []
  );
  const heights = new Array(safeColumnCount).fill(0);

  for (const [feedIndex, photo] of photos.entries()) {
    const ratio = photo.width > 0 && photo.height > 0
      ? photo.height / photo.width
      : 1;
    const nonPortrait = photo.width <= 0 || photo.height <= 0 || photo.width / photo.height >= 0.9;
    const albumKey = photo.album_id ?? photo.albumId ?? `single:${photo.id}`;
    const shortestHeight = Math.min(...heights);
    let selectedColumn = 0;
    let selectedScore = Number.POSITIVE_INFINITY;

    for (let columnIndex = 0; columnIndex < safeColumnCount; columnIndex++) {
      const start = heights[columnIndex];
      if (start > shortestHeight + HEIGHT_BALANCE_SLACK) continue;
      const end = start + ratio;
      const verticalRepeat = columns[columnIndex]
        .slice(-2)
        .some((item) => item.albumKey === albumKey);
      const verticalOrientationRepeat =
        options.disperseNonPortrait &&
        nonPortrait &&
        columns[columnIndex].at(-1)?.nonPortrait;
      let crossColumnOverlap = 0;
      let crossOrientationOverlap = 0;

      for (let otherIndex = 0; otherIndex < safeColumnCount; otherIndex++) {
        if (otherIndex === columnIndex) continue;
        for (const item of columns[otherIndex]) {
          const overlap = overlaps(start, end, item.start, item.end);
          if (item.albumKey === albumKey) crossColumnOverlap += overlap;
          if (options.disperseNonPortrait && nonPortrait && item.nonPortrait) {
            crossOrientationOverlap += overlap;
          }
        }
      }

      const score =
        crossColumnOverlap * 1_000_000 +
        crossOrientationOverlap * 1_000_000 +
        (verticalRepeat ? 10_000 : 0) +
        (verticalOrientationRepeat ? 100_000 : 0) +
        heights[columnIndex];
      if (score < selectedScore) {
        selectedScore = score;
        selectedColumn = columnIndex;
      }
    }

    const start = heights[selectedColumn];
    const positioned: InternalPosition<T> = {
      id: photo.id,
      photo,
      feedIndex,
      albumKey,
      nonPortrait,
      start,
      end: start + ratio,
    };
    columns[selectedColumn].push(positioned);
    heights[selectedColumn] = positioned.end;
  }

  return columns.map((column) =>
    column.map((item) => ({
      id: item.id,
      photo: item.photo,
      feedIndex: item.feedIndex,
    }))
  );
}
