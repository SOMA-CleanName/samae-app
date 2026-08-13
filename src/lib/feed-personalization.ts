export const FEED_INTEREST_HISTORY_KEY = "samae:feed-interest-history:v1";
export const INTEREST_UNDO_WINDOW_MS = 30_000;

export type FeedInterestSignal = {
  id: string;
  addedAt: number;
};

export function parseFeedInterestSignals(raw: string | null): FeedInterestSignal[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const signals: FeedInterestSignal[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const { id, addedAt } = value as { id?: unknown; addedAt?: unknown };
      if (
        typeof id !== "string" ||
        id.length === 0 ||
        typeof addedAt !== "number" ||
        !Number.isFinite(addedAt) ||
        seen.has(id)
      ) continue;
      seen.add(id);
      signals.push({ id, addedAt });
    }
    return signals;
  } catch {
    return [];
  }
}

export function addFeedInterestSignal(
  signals: FeedInterestSignal[],
  id: string,
  addedAt: number
): FeedInterestSignal[] {
  if (signals.some((signal) => signal.id === id)) return signals;
  return [...signals, { id, addedAt }];
}

export function removeFeedInterestSignal(
  signals: FeedInterestSignal[],
  id: string,
  removedAt: number
): FeedInterestSignal[] {
  const signal = signals.find((candidate) => candidate.id === id);
  if (!signal) return signals;
  const elapsed = removedAt - signal.addedAt;
  return elapsed >= 0 && elapsed < INTEREST_UNDO_WINDOW_MS
    ? signals.filter((candidate) => candidate.id !== id)
    : signals;
}

export function migrateCartInterests(
  signals: FeedInterestSignal[],
  cartIds: string[]
): FeedInterestSignal[] {
  const known = new Set(signals.map((signal) => signal.id));
  const result = [...signals];
  for (const id of cartIds) {
    if (known.has(id)) continue;
    known.add(id);
    result.push({ id, addedAt: 0 });
  }
  return result;
}

export function personalizedRecommendationTarget(
  clickedIds: string[],
  interestedIds: string[],
  max: number
): number {
  const signalCount = new Set(clickedIds).size + new Set(interestedIds).size * 2;
  if (signalCount === 0 || max <= 0) return 0;
  return Math.min(max, 3 * (signalCount + 1));
}

export function selectPersonalizationAnchors(
  clickedIds: string[],
  interestedIds: string[],
  max: number
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const source of [interestedIds, clickedIds]) {
    for (let index = source.length - 1; index >= 0; index--) {
      const id = source[index];
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      if (result.length >= Math.max(0, max)) return result;
    }
  }
  return result;
}
