export const INTEREST_RECOMMENDATION_MIN_COUNT = 4;
export const INTEREST_RECOMMENDATION_COLLAPSE_MS = 2_300;

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

// 서버가 앵커별로 묶어 보낸 결과를 화면이 쓰는 줄 모델로 바꾼다.
// 줄 사이 중복은 서버가 이미 제거하지만, 화면에서 다시 걸러 방어한다.
export type InterestRecommendationRow = {
  anchor: InterestRecommendationCard;
  cards: InterestRecommendationCard[];
};

export function toInterestRecommendationRows(
  groups: { anchor: InterestRecommendationPhoto; photos: InterestRecommendationPhoto[] }[]
): InterestRecommendationRow[] {
  const seen = new Set<string>();
  const rows: InterestRecommendationRow[] = [];

  for (const group of groups) {
    const [anchor] = toInterestRecommendationCards([group.anchor]);
    if (!anchor) continue;
    const cards = toInterestRecommendationCards(group.photos).filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
    // 결과가 없는 줄은 내보내지 않는다 — 담은 사진만 덩그러니 남으면 오해를 준다.
    if (cards.length === 0) continue;
    rows.push({ anchor, cards: cards.map((card, seq) => ({ ...card, seq })) });
  }

  return rows;
}

// 줄들을 통틀어 실제로 보이는 추천 장수. 화면 상단 '{n}장' 표기에 쓴다.
export function countInterestRecommendationCards(rows: InterestRecommendationRow[]): number {
  return rows.reduce((total, row) => total + row.cards.length, 0);
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

// 진입 버튼 펼침 안내를 이번 브라우저 세션에서 이미 보여줬는지.
//
// localStorage 가 아니라 sessionStorage 를 쓴다. 영구 저장하면 한 번 본 사용자는
// 다시는 안내를 못 보는데, 이 버튼은 화면 가장자리에 접힌 아이콘으로만 남아
// 존재를 잊기 쉽다. 탭을 닫았다 여는 것(= 웹을 다시 실행하는 것)을 경계로 삼아
// 한 번씩 다시 알린다.
const ENTRY_INTRO_KEY = "samae:interest-similar-intro";

export function interestEntryIntroSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ENTRY_INTRO_KEY) === "1";
  } catch {
    // 사파리 프라이빗 모드 등 접근이 막히면 매번 안내한다(막는 것보다 낫다).
    return false;
  }
}

export function markInterestEntryIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ENTRY_INTRO_KEY, "1");
  } catch {
    /* 저장 실패는 무시 — 다음 열람에서 한 번 더 안내될 뿐이다. */
  }
}
