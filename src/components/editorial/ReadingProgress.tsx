"use client";

import { useEffect, useRef } from "react";

/**
 * 읽기 진행 바 — 화면 최상단 얇은 브랜드 라인.
 *
 * 상태를 리액트로 들고 있으면 스크롤마다 리렌더가 돈다.
 * ref 로 transform 만 직접 건드려 렌더 사이클 밖에서 처리한다.
 */
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = bar.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent">
      <div ref={bar} className="ed-progress h-full w-full bg-brand" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
