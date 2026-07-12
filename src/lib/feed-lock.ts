// 사진 상세 모달이 열려 있는 동안 홈 피드(#feed-viewport)를 현재 스크롤 위치에 '얼린다'.
// 목적: 홈을 position:fixed 로 흐름에서 빼내고 모달을 일반 흐름에 두어, 창(window) 스크롤이
// 모달 콘텐츠를 스크롤하게 한다. 상세의 하단 내비 노출·추천 무한스크롤이 모두 window 스크롤
// 기반이므로, 이래야 모달 안에서도 그 기능들이 그대로 작동한다.
//
// 모달→모달 연속 전환에서 이전 모달의 해제와 다음 모달의 잠금이 겹치며 홈이 잠깐 튀는 것을
// 막기 위해 참조 카운트 + 지연 해제(다음 모달이 즉시 잠그면 해제를 취소)로 관리한다.

let count = 0;
let savedY = 0;
let clickY: number | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

// 피드에서 사진을 클릭하는 '그 순간'의 스크롤 위치를 기억한다.
// Next 가 내비게이션 중 window 를 0 으로 되돌려, 모달 마운트 후 freeze()가 window.scrollY 를
// 읽으면 0(최상단)으로 얼어붙는 레이스가 있다. 클릭 시점 값을 우선 사용해 이를 방지.
export function rememberFeedScroll() {
  clickY = window.scrollY;
}

function feedEl(): HTMLElement | null {
  return typeof document !== "undefined" ? document.getElementById("feed-viewport") : null;
}

function freeze() {
  const el = feedEl();
  // StrictMode(dev) 이펙트 이중 호출 방어 — 이미 얼려진 상태면 재고정하지 않는다
  // (재고정 시 clickY 가 소비된 뒤라 window.scrollY(0)로 최상단에 얼어붙는 문제).
  if (el && el.style.position === "fixed") return;
  savedY = clickY != null ? clickY : window.scrollY;
  clickY = null;
  if (el) {
    const s = el.style;
    s.position = "fixed";
    s.top = `-${savedY}px`;
    s.left = "0";
    s.right = "0";
    s.width = "100%";
  }
  window.scrollTo(0, 0); // 모달을 최상단부터 보여줌(홈은 고정돼 있어 움직이지 않음)
}

function thaw() {
  const el = feedEl();
  if (el) {
    const s = el.style;
    s.position = "";
    s.top = "";
    s.left = "";
    s.right = "";
    s.width = "";
  }
  window.scrollTo(0, savedY); // 홈을 원래 스크롤 위치로 정확히 복원
}

export function lockFeed() {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  if (count === 0) freeze();
  count += 1;
}

export function unlockFeed() {
  count = Math.max(0, count - 1);
  if (count === 0) {
    // 다음 모달이 곧바로 잠그면(모달→모달) 이 해제를 취소해 홈이 튀지 않게 한다.
    pending = setTimeout(() => {
      pending = null;
      if (count === 0) thaw();
    }, 0);
  }
}
