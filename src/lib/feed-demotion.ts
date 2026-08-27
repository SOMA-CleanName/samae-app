export type PromotionStage = 1 | 2 | 3 | 4;
export type FeedPhase = "normal" | "demoted";

export type DemotionCandidate = {
  id: string;
  naturalRank: number;
  demoted: boolean;
};

export type OrientationCandidate = {
  width: number;
  height: number;
  distance?: number;
};

export type SimilarityDiversityCandidate = OrientationCandidate & {
  id: string;
  albumId?: string | null;
};

const PORTRAIT_SHARE_TARGET = 0.75;
const SIMILARITY_PROTECTION_DELTA = 0.015;

function isPortrait(candidate: OrientationCandidate): boolean {
  return candidate.width > 0 && candidate.height > 0 && candidate.width / candidate.height < 0.9;
}

export function rebalancePortraitShare<T extends OrientationCandidate>(
  candidates: T[],
  targetShare = PORTRAIT_SHARE_TARGET,
  protectionDelta = SIMILARITY_PROTECTION_DELTA,
  referenceBestDistance?: number
): T[] {
  if (candidates.length < 2) return [...candidates];
  const distances = candidates
    .map((candidate) => candidate.distance)
    .filter((distance): distance is number => Number.isFinite(distance));
  const bestDistance = Number.isFinite(referenceBestDistance)
    ? referenceBestDistance!
    : distances.length > 0
      ? Math.min(...distances)
      : null;
  const protectedCandidates = bestDistance === null
    ? []
    : candidates.filter(
        (candidate) =>
          candidate.distance !== undefined && candidate.distance <= bestDistance + protectionDelta
      );
  const protectedSet = new Set(protectedCandidates);
  const remaining = candidates.filter((candidate) => !protectedSet.has(candidate));
  // 최유사 1장은 순위를 고정하되, 나머지 보호 후보는 같은 방향 큐의 선두에 둔다.
  // 보호 후보가 한 방향으로 몰려도 첫 화면 전체를 차지하지 않으면서 상단 포함은 유지한다.
  const leadCandidate = protectedCandidates[0];
  const protectedTail = protectedCandidates.slice(1);
  const portraits = [
    ...protectedTail.filter(isPortrait),
    ...remaining.filter(isPortrait),
  ];
  const others = [
    ...protectedTail.filter((candidate) => !isPortrait(candidate)),
    ...remaining.filter((candidate) => !isPortrait(candidate)),
  ];
  const result = leadCandidate ? [leadCandidate] : [];
  let portraitIndex = 0;
  let otherIndex = 0;
  let portraitCount = leadCandidate && isPortrait(leadCandidate) ? 1 : 0;
  const leadIsOther = !!leadCandidate && !isPortrait(leadCandidate);

  while (portraitIndex < portraits.length || otherIndex < others.length) {
    // 첫 고정 후보가 가로/정방형이면 그 한 장을 포함한 4장 단위에서 75%를 맞춘다.
    // 세로 후보이거나 고정 후보가 없으면 기존처럼 세로 슬롯부터 시작한다.
    const targetPortraitCount = leadIsOther
      ? Math.floor((result.length + 1) * targetShare)
      : Math.ceil((result.length + 1) * targetShare);
    const shouldTakePortrait = portraitCount < targetPortraitCount && portraitIndex < portraits.length;
    if (shouldTakePortrait || otherIndex >= others.length) {
      result.push(portraits[portraitIndex++]);
      portraitCount++;
    } else {
      result.push(others[otherIndex++]);
    }
  }
  return result;
}

export function diversifySimilarityCandidates<T extends SimilarityDiversityCandidate>(
  candidates: T[],
  options: {
    targetShare?: number;
    protectionDelta?: number;
    referenceBestDistance?: number;
    preserveOrientationOrder?: boolean;
    albumWindow?: number;
    relevanceBandSize?: number;
  } = {}
): T[] {
  const oriented = options.preserveOrientationOrder
    ? [...candidates]
    : rebalancePortraitShare(
        candidates,
        options.targetShare,
        options.protectionDelta,
        options.referenceBestDistance
      );
  const albumWindow = Math.max(1, Math.floor(options.albumWindow ?? 1));
  const relevanceBandSize = Math.max(
    1,
    Math.floor(options.relevanceBandSize ?? Math.max(1, oriented.length))
  );
  const result: T[] = [];
  const recentAlbums: string[] = [];
  const lastSeenAt = new Map<string, number>();
  const albumKey = (candidate: T) => candidate.albumId ?? `single:${candidate.id}`;

  for (let start = 0; start < oriented.length; start += relevanceBandSize) {
    const pending = oriented.slice(start, start + relevanceBandSize);
    while (pending.length > 0) {
      let index = pending.findIndex((candidate) => !recentAlbums.includes(albumKey(candidate)));
      if (index === -1) {
        index = 0;
        let oldestSeenAt = Number.POSITIVE_INFINITY;
        for (let candidateIndex = 0; candidateIndex < pending.length; candidateIndex++) {
          const seenAt = lastSeenAt.get(albumKey(pending[candidateIndex])) ?? -1;
          if (seenAt < oldestSeenAt) {
            index = candidateIndex;
            oldestSeenAt = seenAt;
          }
        }
      }

      const [picked] = pending.splice(index, 1);
      const key = albumKey(picked);
      result.push(picked);
      lastSeenAt.set(key, result.length - 1);
      recentAlbums.push(key);
      if (recentAlbums.length > albumWindow) recentAlbums.shift();
    }
  }

  return result;
}

export function promotionStage(anchorCount: number, styleConsistency: number): PromotionStage {
  if (anchorCount >= 4 && styleConsistency >= 0.25) return 4;
  if (anchorCount >= 3 && styleConsistency >= 0.18) return 3;
  if (anchorCount >= 2 && styleConsistency >= 0.12) return 2;
  return 1;
}

export function mergeDemotedSimilar<T extends DemotionCandidate>(
  normal: T[],
  demoted: T[],
  stage: PromotionStage
): T[] {
  if (demoted.length === 0) return [...normal];
  if (stage === 1) return [...normal, ...demoted];
  if (stage === 4) {
    return [...normal, ...demoted].sort(
      (left, right) => left.naturalRank - right.naturalRank || Number(left.demoted) - Number(right.demoted)
    );
  }
  const ratio = stage === 2 ? 0.75 : 0.5;
  const insertionIndex = Math.floor(normal.length * ratio);
  return [...normal.slice(0, insertionIndex), ...demoted, ...normal.slice(insertionIndex)];
}

export function uniqueWithinCycle<T extends { id: string }>(
  candidates: T[],
  excludedIds: ReadonlySet<string>,
  limit: number
): T[] {
  const seen = new Set(excludedIds);
  const result: T[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

export function mapSimilarityRows<T extends { id: string; feed_hidden: boolean }>(
  rows: T[]
): Array<Omit<T, "feed_hidden"> & DemotionCandidate> {
  return rows.map(({ feed_hidden, ...row }, naturalRank) => ({
    ...row,
    id: row.id,
    demoted: feed_hidden,
    naturalRank,
  }));
}

export function nextFeedPhase(phase: FeedPhase, cycle: number): {
  phase: FeedPhase;
  cycle: number;
} {
  return phase === "normal"
    ? { phase: "demoted", cycle }
    : { phase: "normal", cycle: cycle + 1 };
}

export function composeDetailRecommendations<T extends DemotionCandidate>(
  normalSimilar: T[],
  demotedSimilar: T[],
  unrelated: T[],
  stage: PromotionStage
): T[] {
  const similar = mergeDemotedSimilar(normalSimilar, demotedSimilar, stage);
  return uniqueWithinCycle([...similar, ...unrelated], new Set(), similar.length + unrelated.length);
}
