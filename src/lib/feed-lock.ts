// 사진 상세 모달이 열려 있는 동안 홈 피드(#feed-viewport)를 현재 스크롤 위치에 '얼린다'.
// 목적: 홈을 position:fixed 로 흐름에서 빼내고 모달을 일반 흐름에 두어, 창(window) 스크롤이
// 모달 콘텐츠를 스크롤하게 한다. 상세의 하단 내비 노출·추천 무한스크롤이 모두 window 스크롤
// 기반이므로, 이래야 모달 안에서도 전체 페이지와 동일하게 작동한다.
//
// 플래시 방지: 홈을 '클릭 순간(내비게이션 전에)' preFreezeFeed() 로 얼린다. 그러면 Next 가
// 내비 중 window 를 0 으로 되돌리거나 모달이 늦게(비동기) 마운트돼도, 홈은 이미 제자리에
// 고정돼 있어 '메인 최상단이 잠깐 보이는' 프레임이 아예 생기지 않는다.
//
// 모달→모달 연속 전환에서 홈이 튀지 않도록 참조 카운트 + 지연 해제로 관리한다.

let count = 0;
let savedY = 0;
let frozen = false;
let pendingThaw: ReturnType<typeof setTimeout> | null = null;
let safety: ReturnType<typeof setTimeout> | null = null;

function feedEl(): HTMLElement | null {
  return typeof document !== "undefined" ? document.getElementById("feed-viewport") : null;
}

function doFreeze(y: number) {
  if (frozen) return; // 이미 얼려짐(중복 호출·StrictMode 방어)
  frozen = true;
  savedY = y;
  const el = feedEl();
  if (el) {
    const s = el.style;
    s.position = "fixed";
    s.top = `-${y}px`;
    s.left = "0";
    s.right = "0";
    s.width = "100%";
  }
  window.scrollTo(0, 0); // 모달을 최상단부터 보여줌(홈은 고정돼 움직이지 않음)
}

function doThaw() {
  if (!frozen) return;
  frozen = false;
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

// 피드에서 사진 클릭 '즉시'(내비게이션 전에) 호출 — 플래시를 원천 차단.
// 모달이 곧 마운트되지 않으면(내비 취소·하드내비 등) 안전하게 자동 해제.
export function preFreezeFeed() {
  doFreeze(window.scrollY);
  if (safety) clearTimeout(safety);
  safety = setTimeout(() => {
    safety = null;
    if (count === 0) doThaw();
  }, 1500);
}

export function lockFeed() {
  if (pendingThaw) {
    clearTimeout(pendingThaw);
    pendingThaw = null;
  }
  if (safety) {
    clearTimeout(safety);
    safety = null;
  }
  if (count === 0) doFreeze(window.scrollY); // preFreeze 로 이미 얼려졌으면 guard 로 무시
  count += 1;
}

export function unlockFeed() {
  count = Math.max(0, count - 1);
  if (count === 0) {
    // 다음 모달이 곧바로 잠그면(모달→모달) 이 해제를 취소해 홈이 튀지 않게 한다.
    pendingThaw = setTimeout(() => {
      pendingThaw = null;
      if (count === 0) doThaw();
    }, 0);
  }
}
