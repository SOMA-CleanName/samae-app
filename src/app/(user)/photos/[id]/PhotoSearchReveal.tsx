"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { SearchPill } from "@/components/user/SearchPill";
import { SearchOptions } from "@/components/user/SearchOptions";

// 이미지 상세(2단계) 검색바 — 처음엔 숨김.
// 하단 추천 그리드가 화면 하단 ⅓쯤 보이기 시작하면 상단에서 내려오고,
// 이후엔 아래로 스크롤 시 접히고 위로 스크롤 시 다시 등장(메인과 동일 거동).
// sentinel(그리드 시작점)을 직접 함께 렌더해 위치를 측정한다.
export function PhotoSearchReveal() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    let lastY = window.scrollY;
    let inGrid = false;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      // 그리드 시작점이 뷰포트 상단 67% 선을 넘으면 = 그리드가 하단 ⅓ 차지
      const top = el!.getBoundingClientRect().top;
      const trigger = window.innerHeight * 0.67;
      const nowInGrid = top <= trigger;

      if (!nowInGrid) {
        setHidden(true); // 아직 사진 영역 — 검색바 숨김
      } else if (!inGrid) {
        setHidden(false); // 그리드 진입 순간 — 위에서 내려옴
      } else {
        const diff = y - lastY;
        if (diff > 8) setHidden(true); // 아래로 → 접힘
        else if (diff < -8) setHidden(false); // 위로 → 등장
      }

      inGrid = nowInGrid;
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-30 border-b border-line bg-bg/85 backdrop-blur transition-transform duration-200 will-change-transform md:left-[72px]",
          hidden && "-translate-y-full"
        )}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
          <SearchPill />
          <SearchOptions />
        </div>
      </div>
      {/* 그리드 시작점 표식 — 추천/포트폴리오 섹션 바로 위 */}
      <div ref={sentinel} aria-hidden className="h-0" />
    </>
  );
}
