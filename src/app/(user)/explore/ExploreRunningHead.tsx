"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type RunningSection = { id: string; no: string; label: string };

/**
 * 러닝 헤드 — 잡지 페이지 위쪽에 붙는 그 한 줄.
 *
 * 원래 여기엔 섹션 탭바가 있었다. 지금 지면은 섹션이 셋뿐이라 탭 행을 둘 만큼이
 * 아니고, 대신 탭바가 하던 두 가지만 남긴다.
 *   ① 스크롤로 상단에 닿으면 'samae' 브랜드가 뜬다
 *   ② 지금 어느 섹션을 보고 있는지 알려준다 (스크롤 스파이)
 *
 * 누르는 물건이 아니라 **읽는 표시**라 한 줄로 충분하다.
 * 섹션 사이 이동은 스크롤로 한다.
 *
 * 진행 바는 /articles 의 ReadingProgress 와 같은 장치다 — 리액트 상태를 안 쓰고
 * transform 을 직접 만진다. 스크롤마다 리렌더가 돌면 긴 페이지에서 바로 끊긴다.
 */
export function ExploreRunningHead({ sections }: { sections: RunningSection[] }) {
  const [stuck, setStuck] = useState(false);
  const [active, setActive] = useState<RunningSection | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  // 고정 감지 — 바 바로 위 센티넬이 화면 위로 사라지면 상단에 붙은 상태.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 스크롤 스파이 + 진행 바. 둘 다 한 rAF 안에서 처리한다.
  useEffect(() => {
    if (sections.length === 0) return;
    let raf = 0;

    const update = () => {
      raf = 0;

      // 헤딩이 화면 상단 42% 안으로 들어온 마지막 섹션이 지금 읽는 섹션
      const line = window.innerHeight * 0.42;
      let current = sections[0];
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s;
      }
      const doc = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 8;
      if (atBottom) current = sections[sections.length - 1];
      setActive((prev) => (prev?.id === current.id ? prev : current));

      if (barRef.current) {
        const max = doc.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        barRef.current.style.transform = `scaleX(${p})`;
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sections]);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />

      {/*
        바깥 껍데기를 h-0 으로 둔다.
        sticky 요소는 문서 흐름에 남아 있어야 고정이 동작하는데, 그대로 두면
        숨어 있을 때(opacity 0)도 제 높이만큼 자리를 먹어 지면에 구멍이 생긴다.
        높이 0 짜리 sticky 안에 실제 바를 넣으면 흐름은 0, 고정은 그대로다.
      */}
      <div className="sticky top-0 z-40 h-0">
        <div
          className={cn(
            "border-b bg-bg/95 backdrop-blur transition-opacity duration-200 ease-out",
            stuck ? "border-line opacity-100" : "pointer-events-none border-transparent opacity-0"
          )}
          aria-hidden={!stuck}
        >
          <div className="mx-auto flex h-11 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6">
            <span className="font-display text-lg italic leading-none text-brand">samae</span>
            {active && (
              <span className="flex min-w-0 items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                <span className="tabular-nums text-faint">{active.no}</span>
                <span className="truncate">{active.label}</span>
              </span>
            )}
          </div>

          {/* 진행 바 — 지면 어디쯤 왔는지 */}
          <span
            ref={barRef}
            aria-hidden
            className="block h-[2px] origin-left scale-x-0 bg-brand"
          />
        </div>
      </div>
    </>
  );
}
