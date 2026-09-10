export type SearchUiSurface = "home" | "results" | "photo";

const SEARCH_UI_VISIBILITY: Record<SearchUiSurface, boolean> = {
  // 홈·검색결과는 다시 켰다 — 상단 한 줄에 검색을 넣는 배치를 맞추는 중.
  // photo(사진 상세)는 아직 그 지면 배치를 안 맞춰서 꺼 둔다.
  home: true,
  results: true,
  photo: false,
};

/** 검색 기능은 유지하되 공개 화면의 진입 UI만 임시로 숨긴다. */
export function shouldShowSearchUi(surface: SearchUiSurface): boolean {
  return SEARCH_UI_VISIBILITY[surface];
}
