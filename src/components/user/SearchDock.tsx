"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getSearchDockMode,
  getSearchDockRightInset,
  getSearchPillAppearance,
  getSearchDockSurface,
  type SearchDockMode,
  type SearchDockVariant,
  type SearchScrollDirection,
} from "@/lib/search-copy";
import { SearchPill } from "./SearchPill";

const SEARCH_DOCK_TOP_OFFSET_PX = 8;

/** 원래 검색창 하나를 홈·상세 화면 상단에 붙이고 표면만 전환한다. */
export function SearchDock({
  initial = "",
  placeholder,
  variant = "home",
  inline = false,
  back,
}: {
  initial?: string;
  placeholder: string;
  variant?: SearchDockVariant;
  /**
   * 검색창 왼쪽에 같은 줄로 세울 뒤로가기.
   *
   * 이게 없으면 detail 변형은 ml-12 로 왼쪽을 비운다 — 화면에 떠 있는 부유 버튼
   * (사진 상세용 검은 원)이 앉을 자리다. 밝은 지면(검색 결과)에서는 그 검은 원이
   * 겉돌아서, 버튼을 흐름 안으로 들여 같은 줄에 세운다. 그러면 비워 둘 자리도 없다.
   */
  back?: ReactNode;
  /**
   * 상단 한 줄(로고 ─ 검색 ─ 프로필) 안에 끼워 넣을 때.
   * 자체 sticky 와 아래 여백을 끈다 — 줄 안에서 그것들이 살아 있으면
   * 형제 요소와 높이가 어긋나고 아래에 빈칸이 생긴다.
   */
  inline?: boolean;
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SearchDockMode>("inline");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [scrollDirection, setScrollDirection] =
    useState<SearchScrollDirection>("idle");

  useEffect(() => {
    let frame = 0;
    let previousScrollY = window.scrollY;

    const updateMode = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const markerTop = markerRef.current?.getBoundingClientRect().top;
        if (markerTop == null) return;

        const nextScrollY = window.scrollY;
        const delta = nextScrollY - previousScrollY;
        if (delta > 1) setScrollDirection("down");
        else if (delta < -1) setScrollDirection("up");
        previousScrollY = nextScrollY;

        setMode(getSearchDockMode(markerTop, SEARCH_DOCK_TOP_OFFSET_PX));
      });
    };

    updateMode();
    window.addEventListener("scroll", updateMode, { passive: true });
    window.addEventListener("resize", updateMode);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateMode);
      window.removeEventListener("resize", updateMode);
    };
  }, []);

  const detail = variant !== "home";
  const rightInset = getSearchDockRightInset(variant);
  const surface = getSearchDockSurface(mode, {
    hovered,
    focused,
    scrollDirection,
  });
  const appearance = getSearchPillAppearance(mode, surface, focused);

  return (
    <>
      {!inline && <div ref={markerRef} aria-hidden="true" className="h-px" />}
      <div
        data-search-dock-mode={mode}
        data-search-dock-surface={surface}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
        style={!inline && rightInset > 0 ? { marginRight: rightInset } : undefined}
        className={
          inline
            ? "min-w-0 flex-1"
            : `sticky top-2 z-30 ${
                back
                  ? "mx-auto flex max-w-screen-2xl items-center gap-2 px-1"
                  : detail
                    ? "ml-12"
                    : "mx-auto max-w-screen-2xl px-1"
              }`
        }
      >
        {back}
        <div className={back ? "min-w-0 flex-1" : undefined}>
          <SearchPill
            initial={initial}
            placeholder={placeholder}
            surface={surface}
            appearance={appearance}
          />
        </div>
      </div>
      {!inline && (
        <div aria-hidden="true" className={detail ? "h-2 sm:h-3" : "h-3 sm:h-4"} />
      )}
    </>
  );
}
