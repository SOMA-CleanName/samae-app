"use client";

// 진입 시 항상 페이지 최상단으로 — Next 스크롤 복원/라우터 캐시가 이전 위치를
// 복원해 "스크롤 내려간 채 로딩"되는 현상을 방지. 경로가 바뀔 때마다 적용.
import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ScrollTop() {
  const pathname = usePathname();
  useIso(() => {
    // Next 라우터/스트리밍의 스크롤 복원이 layout effect 이후 "늦게" 덮어쓰기 때문에
    // 짧은 시간(GUARD_MS) 동안 최상단을 유지한다. 단, 사용자가 스크롤(휠/터치/키)하면
    // 즉시 중단해 의도적 스크롤은 방해하지 않는다.
    const GUARD_MS = 700;
    let active = true;
    const stop = () => {
      active = false;
    };
    const start = performance.now();
    const tick = () => {
      if (!active) return;
      window.scrollTo(0, 0);
      if (performance.now() - start < GUARD_MS) requestAnimationFrame(tick);
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    tick();
    return () => {
      active = false;
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [pathname]);
  return null;
}
