export type PromotionStage = 1 | 2 | 3 | 4;
export type FeedPhase = "normal" | "demoted";

export type DemotionCandidate = {
  id: string;
  naturalRank: number;
  demoted: boolean;
};

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
