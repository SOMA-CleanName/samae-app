export type PhotoBackButtonMode = "photo" | "floating";

/** 검색창 노출 여부와 관계없이 기존의 뷰포트 고정 위치를 유지한다. */
export function getPhotoBackButtonMode(_searchVisible?: boolean): PhotoBackButtonMode {
  void _searchVisible;
  return "floating";
}

export type BackNavigationAction = "history" | "home";

/** 이전 문서가 있으면 돌아가고, 직접 진입이면 기본 홈으로 안전하게 복귀한다. */
export function getBackNavigationAction(historyLength: number): BackNavigationAction {
  return historyLength > 1 ? "history" : "home";
}
