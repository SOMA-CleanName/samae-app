"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type ExploreTab = { id: string; label: string };

// 상단 고정 바(브랜드 헤더 + 탭) 높이 — 스크롤 스파이/이동 보정값.
const STICKY_OFFSET = 92;

// 탐색 중간 메뉴바 — 히어로(커버) 아래에 놓이고, 스크롤로 상단에 닿으면 sticky 로 고정된다.
// 고정되면 위에 '사매' 브랜드 헤더가 슬라이드 인. 탭을 누르면 해당 섹션으로 스크롤 이동.
export function ExploreTabBar({ tabs }: { tabs: ExploreTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 고정(stuck) 감지 — 바 바로 위 센티넬이 화면 위로 사라지면 상단에 붙은 상태.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 스크롤 스파이 — 기준선(상단 고정 바 아래)을 지난 마지막 섹션을 활성 탭으로.
  // 단, 마지막 섹션은 아래 여백이 짧아 기준선까지 못 올라올 수 있으므로,
  // 그 헤딩이 화면 상단 절반(≈45%)에 들어오거나 페이지 맨 밑일 때만 활성으로 승격한다.
  useEffect(() => {
    if (tabs.length === 0) return;
    const baseLine = STICKY_OFFSET + 12; // 상단 고정 바 바로 아래 기준선

    function onScroll() {
      const vh = window.innerHeight;
      let current = tabs[0].id;
      for (const t of tabs) {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top <= baseLine) current = t.id;
      }
      // 마지막 섹션 승격 — 헤딩이 상단 45% 안으로 들어오거나 맨 밑일 때만.
      const last = tabs[tabs.length - 1];
      const lastEl = document.getElementById(last.id);
      if (lastEl) {
        const top = lastEl.getBoundingClientRect().top;
        const atBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
        if (top <= vh * 0.45 || atBottom) current = last.id;
      }
      setActive(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [tabs]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {/* 커버(히어로)와의 간격 — 스크롤 시 먼저 사라짐 */}
      <div aria-hidden className="h-6" />
      {/* 고정 감지용 센티넬(바 바로 위) */}
      <div ref={sentinelRef} aria-hidden className="h-0" />

      <div className="sticky top-0 z-40 -mx-2.5 border-b border-line bg-bg/95 backdrop-blur sm:-mx-4">
        {/* '사매' 브랜드 헤더 — 상단 고정될 때만 슬라이드 인 */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-out",
            stuck ? "h-11 opacity-100" : "h-0 opacity-0"
          )}
        >
          <div className="flex h-11 items-center justify-center gap-1.5">
            {/* samae 워드마크 로고 (FeedHero 와 동일 스타일) */}
            <span className="font-display text-lg italic leading-none text-brand">samae</span>
            <span className="text-xs font-extrabold tracking-tight">사매</span>
          </div>
        </div>

        {/* 탭 바 (가로 스크롤) */}
        <div className="flex gap-1 overflow-x-auto px-2.5 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "relative shrink-0 whitespace-nowrap px-3 py-3 text-body-sm font-bold transition-colors",
                  on ? "text-brand" : "text-fg/50 hover:text-fg/80"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand transition-opacity",
                    on ? "opacity-100" : "opacity-0"
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
