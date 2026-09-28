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
  SEARCH_PLACEHOLDER,
  startSearchBorderMotion,
  type SearchDockSurface,
  type SearchBorderMotionState,
  type SearchPillAppearance,
} from "@/lib/search-copy";
import { CameraIcon, SearchIcon } from "./icons";

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
  placeholder = SEARCH_PLACEHOLDER,
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
        className={`peer relative z-[1] h-[42px] w-full rounded-md border pl-10 pr-11 text-body-sm outline-none transition-[background-color,border-color,border-width,box-shadow,color,backdrop-filter] duration-300 ease-out hover:border-brand/45 focus:border-brand/55 focus:ring-2 focus:ring-brand/10 ${borderClass} ${
          appearance === "clear"
            ? "bg-transparent text-transparent caret-transparent shadow-none placeholder:text-transparent"
            : appearance === "overlay"
              ? "bg-black/35 text-white caret-white shadow-sm backdrop-blur-sm placeholder:text-white/65"
              : "bg-surface text-fg caret-current shadow-sm placeholder:text-faint"
        }`}
      />
      {/* 사진으로 검색 — 자리만 먼저 잡았다. 누르면 사진을 올려 SigLIP 으로 비슷한 사진을 찾는다(작업 중).
          입력칸을 눌러 커서가 생기면 서서히 사라진다(글을 쓰는 동안은 글 검색이다) */}
      <button
        type="button"
        aria-label="사진으로 검색"
        title="사진으로 검색"
        className={`absolute right-1.5 top-1/2 z-[2] grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md transition-[color,opacity] duration-300 ease-out peer-focus:pointer-events-none peer-focus:opacity-0 ${
          appearance === "overlay" ? "text-white/75 hover:text-white" : "text-muted hover:text-brand"
        }`}
      >
        <CameraIcon className="h-5 w-5" />
      </button>
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
