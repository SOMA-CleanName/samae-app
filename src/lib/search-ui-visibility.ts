export type SearchUiSurface = "home" | "results" | "photo";

const SEARCH_UI_VISIBILITY: Record<SearchUiSurface, boolean> = {
  home: false,
  results: false,
  photo: false,
};

/** 검색 기능은 유지하되 공개 화면의 진입 UI만 임시로 숨긴다. */
export function shouldShowSearchUi(surface: SearchUiSurface): boolean {
  return SEARCH_UI_VISIBILITY[surface];
}
