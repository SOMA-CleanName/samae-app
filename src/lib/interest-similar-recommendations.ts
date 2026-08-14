export const INTEREST_RECOMMENDATION_MIN_COUNT = 4;
export const INTEREST_RECOMMENDATION_COLLAPSE_MS = 3_000;

export type InterestRecommendationPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
};

export type InterestRecommendationCard = {
  id: string;
  src: string;
  w: number;
  h: number;
  seq: number;
};

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function canOpenInterestRecommendations(ids: string[]) {
  return uniqueIds(ids).length >= INTEREST_RECOMMENDATION_MIN_COUNT;
}

export function interestRecommendationRequestKey(ids: string[]) {
  return uniqueIds(ids).join("|");
}

export function toInterestRecommendationCards(
  photos: InterestRecommendationPhoto[]
): InterestRecommendationCard[] {
  const seen = new Set<string>();
  const cards: InterestRecommendationCard[] = [];

  for (const photo of photos) {
    if (!photo.id || seen.has(photo.id)) continue;
    seen.add(photo.id);
    cards.push({
      id: photo.id,
      src: photo.thumb_url ?? photo.src_url,
      w: photo.width,
      h: photo.height,
      seq: cards.length,
    });
  }

  return cards;
}
