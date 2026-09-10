"use client";

/**
 * "뒤로 갈 데가 우리 페이지인가"를 판정한다.
 *
 * 지면 상단 뒤로가기(StickyBack)를 상위 지면 고정 링크로 만들었더니 이런 게 나왔다.
 *   홈 피드의 읽을거리 카드 → 아티클 → 뒤로 → 글 목록으로 빠짐
 * 온 곳이 홈인데 글 목록에 떨어진다. 사람이 기대하는 "뒤로"가 아니다.
 *
 * 그렇다고 무조건 history.back() 을 쓸 수도 없다. 이 지면들(아티클·장소·가이드)은
 * 검색·AI 인용으로 바로 들어오는 일이 잦은데, 그때 뒤는 구글이지 우리가 아니다.
 *
 * 그래서 **이 문서에서 앱 안 이동이 한 번이라도 있었는지**만 본다.
 *   · 문서가 열린 순간의 history.length 를 기억해 두고(markDocumentEntry)
 *   · 지금 값이 그보다 크면 그 사이 우리가 push 한 것이므로 back() 이 우리 페이지로 간다
 *
 * document.referrer 로는 안 된다. 소프트 내비게이션에서는 referrer 가 안 바뀌어서,
 * 구글 → 홈 → 아티클로 들어온 사람도 "구글에서 왔다"로 읽힌다(위 버그 그대로).
 *
 * 이 모듈의 변수는 **문서 하나당 한 벌**이다. 소프트 내비게이션에서는 살아남고,
 * 새로 로드하면 초기화된다 — 정확히 원하는 수명이다.
 */

let entryHistoryLength: number | null = null;

/** 문서가 열린 시점의 history 길이를 한 번만 기록한다. (루트 레이아웃의 프로브가 호출) */
export function markDocumentEntry(): void {
  if (entryHistoryLength !== null) return;
  if (typeof window === "undefined") return;
  entryHistoryLength = window.history.length;
}

/** 뒤로 갔을 때 우리 페이지에 닿는가. */
export function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  // 프로브가 아직 안 돌았으면(하이드레이션 직전) 안전한 쪽 — 링크로 이동한다.
  if (entryHistoryLength === null) return false;
  return window.history.length > entryHistoryLength;
}
