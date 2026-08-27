/** 공개 사진에서 함께 자주 쓰이는 한국어 태그 조합(2026-08-27 집계). */
export const SEARCH_PLACEHOLDER_EXAMPLES = [
  "개인스냅 빈티지스냅",
  "데이트 커플스냅",
  "패션 화보",
  "야외웨딩스냅 웨딩스냅",
  "빈티지 필름",
  "가을 감성",
] as const;

/** 서버에서 고른 난수를 인덱스로 바꿔 SSR과 hydration에 같은 문구를 사용한다. */
export function pickSearchPlaceholder(randomFraction: number): string {
  const fraction = Number.isFinite(randomFraction)
    ? Math.min(Math.max(randomFraction, 0), 0.999999999999)
    : 0;
  return SEARCH_PLACEHOLDER_EXAMPLES[Math.floor(fraction * SEARCH_PLACEHOLDER_EXAMPLES.length)];
}

export type SearchDockMode = "inline" | "floating";
export type SearchDockVariant = "home" | "detail" | "photo";

/** 사진 상세에서만 오른쪽에 약간의 숨 쉴 공간을 둔다. */
export function getSearchDockRightInset(variant: SearchDockVariant): number {
  return variant === "photo" ? 12 : 0;
}

/** 검색창의 원래 위치가 상단 기준선을 지나면 플로팅 상태로 전환한다. */
export function getSearchDockMode(
  markerTop: number,
  topOffset: number,
): SearchDockMode {
  return markerTop <= topOffset ? "floating" : "inline";
}

export type SearchDockSurface = "filled" | "transparent";
export type SearchDockBorderTone = "strong" | "subtle";
export type SearchPillAppearance = "surface" | "clear" | "overlay" | "active";
export type SearchScrollDirection = "idle" | "up" | "down";
export type SearchDockInteraction = {
  hovered: boolean;
  focused: boolean;
  scrollDirection: SearchScrollDirection;
};

/** 플로팅 검색창은 내려갈 때만 비우고, 사용 의도가 보이면 즉시 다시 채운다. */
export function getSearchDockSurface(
  mode: SearchDockMode,
  interaction: SearchDockInteraction = {
    hovered: false,
    focused: false,
    scrollDirection: "idle",
  },
): SearchDockSurface {
  if (mode === "inline") return "filled";
  if (
    interaction.hovered ||
    interaction.focused ||
    interaction.scrollDirection === "up"
  ) {
    return "filled";
  }
  return "transparent";
}

/** 원래 위치는 기본 표면, 내려갈 때는 투명, 플로팅 복구 시에는 반투명 표면을 쓴다. */
export function getSearchPillAppearance(
  mode: SearchDockMode,
  surface: SearchDockSurface,
  focused = false,
): SearchPillAppearance {
  if (mode === "inline") return "surface";
  if (focused) return "active";
  return surface === "transparent" ? "clear" : "overlay";
}

/** 플로팅 검색창은 긴 태그 예시 대신 짧은 행동 문구만 노출한다. */
export function getSearchPillPlaceholder(
  appearance: SearchPillAppearance,
  placeholder: string,
): string {
  return appearance === "overlay" || appearance === "active" ? "검색" : placeholder;
}

/** 투명 상태의 외곽선은 사진을 가리지 않도록 옅게 낮춘다. */
export function getSearchDockBorderTone(
  surface: SearchDockSurface,
): SearchDockBorderTone {
  return surface === "transparent" ? "subtle" : "strong";
}

/** 투명 상태에서도 외곽선 위치가 또렷하게 보이도록 선만 살짝 두껍게 한다. */
export function getSearchDockBorderWidth(surface: SearchDockSurface): number {
  return surface === "transparent" ? 1.5 : 1;
}

export type SearchBorderMotionState = "idle" | "running" | "done";

/** 한 검색창 인스턴스에서 테두리 모션은 최초 진입 때만 시작한다. */
export function startSearchBorderMotion(state: SearchBorderMotionState): SearchBorderMotionState {
  return state === "idle" ? "running" : state;
}

/** 테두리 모션을 마친 검색창은 해당 화면이 닫힐 때까지 다시 재생하지 않는다. */
export function finishSearchBorderMotion(state: SearchBorderMotionState): SearchBorderMotionState {
  return state === "running" ? "done" : state;
}

/** 반응형 SVG 외곽선이 검색창의 왼쪽 위 모서리에서 시작하도록 만든다. */
export function getSearchBorderTraceRect(inset: number, radius: number) {
  const safeInset = Math.max(0, inset);
  const safeRadius = Math.max(0, radius);
  const insetSize = safeInset * 2;

  return {
    x: safeInset,
    y: safeInset,
    width: `calc(100% - ${insetSize}px)`,
    height: `calc(100% - ${insetSize}px)`,
    rx: safeRadius + safeInset,
    pathLength: 100,
  };
}

/** 좌상단에서 출발한 빛이 외곽선을 한 바퀴 돌고 같은 지점으로 돌아오게 한다. */
export function getSearchBorderTraceMotion(pathLength: number, traceLength: number) {
  const safePathLength = Math.max(0, pathLength);
  const safeTraceLength = Math.min(Math.max(0, traceLength), safePathLength);

  return {
    dashArray: `${safeTraceLength} ${safePathLength - safeTraceLength}`,
    startDashOffset: safeTraceLength,
    endDashOffset: safeTraceLength - safePathLength,
  };
}
