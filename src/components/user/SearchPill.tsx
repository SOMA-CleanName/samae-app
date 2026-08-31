"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { searchHref } from "@/lib/search-navigation";
import {
  finishSearchBorderMotion,
  getSearchDockBorderWidth,
  getSearchDockBorderTone,
  getSearchBorderTraceMotion,
  getSearchBorderTraceRect,
  getSearchPillPlaceholder,
  SEARCH_PLACEHOLDER_EXAMPLES,
  startSearchBorderMotion,
  type SearchDockSurface,
  type SearchBorderMotionState,
  type SearchPillAppearance,
} from "@/lib/search-copy";
import { SearchIcon } from "./icons";

const SEARCH_BORDER_TRACE_RECT = getSearchBorderTraceRect(1, 6);
const SEARCH_BORDER_TRACE_MOTION = getSearchBorderTraceMotion(
  SEARCH_BORDER_TRACE_RECT.pathLength,
  14,
);
const SEARCH_BORDER_TRACE_STYLE = {
  "--search-border-dash-array": SEARCH_BORDER_TRACE_MOTION.dashArray,
  "--search-border-start-dash-offset": SEARCH_BORDER_TRACE_MOTION.startDashOffset,
  "--search-border-end-dash-offset": SEARCH_BORDER_TRACE_MOTION.endDashOffset,
} as CSSProperties;

/** 홈·검색 결과·사진 상세에서 사용하는 자연어 사진 검색창. */
export function SearchPill({
  initial = "",
  placeholder = SEARCH_PLACEHOLDER_EXAMPLES[0],
  surface = "filled",
  appearance = "surface",
}: {
  initial?: string;
  placeholder?: string;
  surface?: SearchDockSurface;
  appearance?: SearchPillAppearance;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  const [borderMotion, setBorderMotion] = useState<SearchBorderMotionState>("idle");
  const borderTone = getSearchDockBorderTone(surface);
  const borderWidth = getSearchDockBorderWidth(surface);
  const displayPlaceholder = getSearchPillPlaceholder(appearance, placeholder);
  const borderClass =
    appearance === "overlay"
      ? "border-white/20"
      : borderTone === "subtle"
        ? "border-fg/20"
        : "border-line-strong";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(searchHref(query));
  }

  return (
    <form
      onSubmit={submit}
      onMouseEnter={() => setBorderMotion(startSearchBorderMotion)}
      onFocusCapture={() => setBorderMotion(startSearchBorderMotion)}
      role="search"
      data-border-motion={borderMotion}
      className="samae-search-frame relative w-full rounded-md"
    >
      <span className="samae-search-icon pointer-events-none absolute left-3.5 top-1/2 z-[2] -translate-y-1/2 text-brand">
        <SearchIcon className="h-5 w-5" />
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={displayPlaceholder}
        aria-label="사진 분위기 검색"
        autoComplete="off"
        maxLength={120}
        style={{ borderWidth }}
        className={`relative z-[1] h-[42px] w-full rounded-md border pl-10 pr-4 text-body-sm outline-none transition-[background-color,border-color,border-width,box-shadow,color,backdrop-filter] duration-300 ease-out hover:border-brand/45 focus:border-brand/55 focus:ring-2 focus:ring-brand/10 ${borderClass} ${
          appearance === "clear"
            ? "bg-transparent text-transparent caret-transparent shadow-none placeholder:text-transparent"
            : appearance === "overlay"
              ? "bg-black/35 text-white caret-white shadow-sm backdrop-blur-sm placeholder:text-white/65"
              : "bg-surface text-fg caret-current shadow-sm placeholder:text-faint"
        }`}
      />
      <svg
        aria-hidden="true"
        className="samae-search-border-trace"
      >
        <rect
          {...SEARCH_BORDER_TRACE_RECT}
          className="samae-search-border-trace-path"
          style={SEARCH_BORDER_TRACE_STYLE}
          onAnimationEnd={() => setBorderMotion(finishSearchBorderMotion)}
        />
      </svg>
    </form>
  );
}
