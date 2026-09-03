export type SearchUiSurface = "home" | "results" | "photo";

const SEARCH_UI_VISIBILITY: Record<SearchUiSurface, boolean> = {
  // ⚠️ dev 는 이 둘을 true 로 켜 뒀지만 **main 의 판단을 유지한다** —
  //    main 에는 dev 가 갈라진 뒤에 들어온 `chore: 검색 UI 임시 숨김`(#301)이 있고,
  //    그게 더 최신이자 의도된 프로덕션 결정이다. 켤지는 별도로 정할 일이다.
  home: false,
  results: false,
  photo: false,
};

/** 검색 기능은 유지하되 공개 화면의 진입 UI만 임시로 숨긴다. */
export function shouldShowSearchUi(surface: SearchUiSurface): boolean {
  return SEARCH_UI_VISIBILITY[surface];
}
