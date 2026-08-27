"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  initial?: string;
  placeholder: string;
  variant?: SearchDockVariant;
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
      <div ref={markerRef} aria-hidden="true" className="h-px" />
      <div
        data-search-dock-mode={mode}
        data-search-dock-surface={surface}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
        style={rightInset > 0 ? { marginRight: rightInset } : undefined}
        className={`sticky top-2 z-30 ${
          detail ? "ml-12" : "mx-auto max-w-screen-2xl px-1"
        }`}
      >
        <SearchPill
          initial={initial}
          placeholder={placeholder}
          surface={surface}
          appearance={appearance}
        />
      </div>
      <div
        aria-hidden="true"
        className={detail ? "h-3 sm:h-4" : "h-6 sm:h-9"}
      />
    </>
  );
}
