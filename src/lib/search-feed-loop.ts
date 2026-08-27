import { seededShuffle } from "./seeded-shuffle.ts";
import { hasOrientationIntent } from "./siglip-text-search-core.ts";

type SearchLoopItem = {
  id: string;
  width?: number;
  height?: number;
  album_id?: string | null;
  albumId?: string | null;
};

function albumKey(item: SearchLoopItem): string {
  return item.album_id ?? item.albumId ?? `single:${item.id}`;
}

function isPortrait(item: SearchLoopItem): boolean {
  return (
    typeof item.width === "number" &&
    typeof item.height === "number" &&
    item.width > 0 &&
    item.height > 0 &&
    item.width / item.height < 0.9
  );
}

function createCyclicPicker<T extends { id: string }>(
  pool: T[],
  seed: string,
  skippedFirstId?: string
): (recentAlbums: readonly string[]) => T {
  let cycle = 0;
  let batch = skippedFirstId
    ? pool.filter((item) => item.id !== skippedFirstId)
    : [...pool];
  let previousId: string | null = null;

  return (recentAlbums) => {
    if (batch.length === 0) {
      cycle += 1;
      batch = seededShuffle(pool, `${seed}:cycle:${cycle}`);
      if (batch.length > 1 && batch[0]?.id === previousId) {
        batch = [...batch.slice(1), batch[0]];
      }
    }
    let index = batch.findIndex(
      (candidate) => !recentAlbums.includes(albumKey(candidate))
    );
    if (index === -1) index = 0;
    const [picked] = batch.splice(index, 1);
    previousId = picked.id;
    return picked;
  };
}

export function shouldKeepGallerySentinel({
  searchMode,
  poolSize,
  visibleCount,
  canLoadServer,
}: {
  searchMode: boolean;
  poolSize: number;
  visibleCount: number;
  canLoadServer: boolean;
}): boolean {
  if (searchMode) return poolSize > 0;
  return visibleCount < poolSize || canLoadServer;
}

/**
 * 검색 결과를 방향별 독립 큐로 순환해 모든 48장 구간의 세로 비율을 유지한다.
 * 각 큐는 고유 후보를 먼저 소진하고 이후 결정적 셔플로 반복한다.
 */
export function expandSearchResultLoop<T extends SearchLoopItem>(
  items: T[],
  visibleCount: number,
  seed: string
): T[] {
  if (items.length === 0 || visibleCount <= 0) return [];

  const target = Math.max(0, Math.floor(visibleCount));
  const portraits = items.filter(isPortrait);
  const others = items.filter((item) => !isPortrait(item));
  if (
    hasOrientationIntent(seed) ||
    portraits.length === 0 ||
    others.length === 0
  ) {
    const expanded: T[] = [];
    let cycle = 0;

    while (expanded.length < target) {
      let batch = cycle === 0
        ? items
        : seededShuffle(items, `${seed}:search-cycle:${cycle}`);
      const previous = expanded.at(-1);
      if (previous && batch.length > 1 && batch[0]?.id === previous.id) {
        batch = [...batch.slice(1), batch[0]];
      }
      expanded.push(...batch.slice(0, target - expanded.length));
      cycle += 1;
    }

    return expanded;
  }

  const lead = items[0];
  const leadIsPortrait = isPortrait(lead);
  const takePortrait = createCyclicPicker(
    portraits,
    `${seed}:portrait`,
    leadIsPortrait ? lead.id : undefined
  );
  const takeOther = createCyclicPicker(
    others,
    `${seed}:other`,
    leadIsPortrait ? undefined : lead.id
  );
  const balanced: T[] = [lead];
  let portraitCount = leadIsPortrait ? 1 : 0;
  const recentAlbums = [albumKey(lead)];

  while (balanced.length < target) {
    const targetPortraitCount = Math.ceil((balanced.length + 1) * 0.75);
    const picked = portraitCount < targetPortraitCount
      ? takePortrait(recentAlbums)
      : takeOther(recentAlbums);
    balanced.push(picked);
    recentAlbums.push(albumKey(picked));
    if (recentAlbums.length > 12) recentAlbums.shift();
    if (isPortrait(picked)) {
      portraitCount += 1;
    }
  }

  return balanced;
}
