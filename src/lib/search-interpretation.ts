// 검색어를 어떻게 해석했나 — 검색 기록(search_logs)에 남기고 어드민 「도구 → 검색」 이 보여준다.
//
// 검색은 검색어를 목적("커플")과 무드("가을 감성")로 나누고, 무드는 가장 가까운 무드 가족으로 틀어 찾는다
// (lib/siglip-text-search familySearch, docs/47 §9 · §10). 운영자가 "이 검색어가 어느 무드로 갔나" 를 봐야
// 사전(무드 가족)이 엇나간 곳을 찾는다.
//
// `server-only` 가 아닌 건 테스트와 어드민 클라이언트 화면이 같이 쓰기 때문이다.

export type SearchInterpretation = {
  purposes: string[];
  moodText: string | null;
  /** family = 정확한 검색(그 가족만) · big = 애매한 검색(큰 무드 전체) · null = 무드 가족 검색을 안 탔다 */
  moodMode: "family" | "big" | null;
  moodFamilies: string[];
  moodFilled: string[];
};

export const EMPTY_INTERPRETATION: SearchInterpretation = {
  purposes: [],
  moodText: null,
  moodMode: null,
  moodFamilies: [],
  moodFilled: [],
};

/** 목적 키 → 이름 (lib/siglip-text-search-core PHOTO_PURPOSE_KEYS) */
export const SEARCH_PURPOSE_LABELS: Record<string, string> = {
  personal: "개인",
  couple: "커플",
  friendship: "우정",
  wedding: "웨딩",
  pet: "반려동물",
  commercial: "상업",
  event: "행사",
};

export function purposeLabel(key: string): string {
  return SEARCH_PURPOSE_LABELS[key] ?? key;
}

/** 검색 결과(PhotoSearchResult)에서 기록할 해석만 뽑는다 */
export function interpretationFrom(result: {
  purposes?: readonly string[];
  moodText?: string;
  mood?: { mode: "family" | "big"; families: string[]; filled?: string[] };
} | null | undefined): SearchInterpretation {
  if (!result) return EMPTY_INTERPRETATION;
  const moodText = result.moodText?.trim() || null;
  return {
    purposes: [...(result.purposes ?? [])],
    moodText,
    moodMode: result.mood?.mode ?? null,
    moodFamilies: result.mood?.families ?? [],
    moodFilled: result.mood?.filled ?? [],
  };
}

/**
 * 어떤 길로 찾았나 — 한 줄 설명.
 *   무드 가족(정확) · 큰 무드(애매) · 목적 · 목적+무드(벡터) · 무드(태그+벡터) · 해석 없음
 */
export function routeLabel(i: SearchInterpretation): string {
  if (i.moodMode === "family") return "무드 가족 · 정확";
  if (i.moodMode === "big") return "큰 무드 · 애매";
  if (i.purposes.length && i.moodText) return "목적 + 무드(벡터)";
  if (i.purposes.length) return "목적만";
  if (i.moodText) return "무드(태그 + 벡터)";
  return "해석 없음";
}
