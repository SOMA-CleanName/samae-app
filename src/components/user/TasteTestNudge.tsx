"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SHOW_DELAY_MS = 5_000;
const MIN_SCROLL_Y = 120;
const DISMISSED_KEY = "samae:taste-test-nudge-dismissed";

// 홈 피드를 둘러보기 시작한 사용자에게만 노출하는 취향 테스트 안내.
// 하단 플로팅 내비를 가리지 않도록 그 위에 떠 있고, 닫으면 현재 탭 세션에서는 다시 띄우지 않는다.
export function TasteTestNudge() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      /* 스토리지 접근 불가 시 현재 페이지에서만 동작 */
    }

    let showTimer: number | null = null;
    const onScroll = () => {
      if (showTimer !== null || window.scrollY < MIN_SCROLL_Y) return;
      showTimer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (showTimer !== null) window.clearTimeout(showTimer);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* 스토리지 접근 불가 시 현재 마운트 동안만 닫힘 */
    }
  }

  function goToTasteTest() {
    if (navigating) return;
    setNavigating(true);
    setVisible(false);
    window.dispatchEvent(new Event("samae:taste-test-navigation"));
    window.setTimeout(() => router.push("/explore?focus=taste"), 520);
  }

  return (
    <aside
      aria-label="무료 취향 테스트 안내"
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 z-30 flex justify-end px-2.5 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none ${
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-[calc(100%+1.5rem)] scale-95 opacity-0"
      }`}
      style={{ bottom: "5.25rem" }}
    >
      <div className="pointer-events-auto w-fit max-w-[calc(100vw-1.25rem)] rounded-xl border border-line-strong bg-bg/95 px-3 py-3 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-start gap-2">
          <p className="min-w-0 shrink">
            <span className="block whitespace-nowrap text-[clamp(0.75rem,3.5vw,0.875rem)] font-semibold leading-snug text-fg">
              내 취향 사진들만 보고 싶지 않나요?
            </span>
            <span className="mt-1 block whitespace-nowrap text-[clamp(0.7rem,3.2vw,0.75rem)] leading-snug text-muted">
              무료로 내 취향 테스트를 해보세요!
            </span>
          </p>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={goToTasteTest}
              disabled={navigating}
              className="whitespace-nowrap rounded-lg border border-brand bg-brand px-2 py-2 text-[0.7rem] font-semibold text-white transition-opacity hover:opacity-90 sm:px-2.5 sm:text-caption"
            >
              하러가기 →
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="취향 테스트 안내 닫기"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-xl font-light leading-none text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
