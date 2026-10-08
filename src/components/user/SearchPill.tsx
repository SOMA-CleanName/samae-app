"use client";

import { useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { NAV_FRESH_KEY } from "@/lib/nav-fresh";
import { searchHref, searchSessionStorageKeys } from "@/lib/search-navigation";
import { useSearchPending } from "@/lib/search-pending";
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
import { ImageSearchPanel } from "./ImageSearchPanel";
import { prefersNativePicker, useImageSearchUpload } from "@/lib/use-image-search-upload";

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
  attached = false,
}: {
  initial?: string;
  placeholder?: string;
  surface?: SearchDockSurface;
  appearance?: SearchPillAppearance;
  /** 아래에 연관 무드 판이 붙어 있다 — 아래 두 모서리를 각지게 해 판과 이음매 없이 잇는다 */
  attached?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  // 검색 결과를 불러오는 동안 끝에 빨간 고리가 돈다(사람 요청 2026-10-05) — 내가 시작한 검색 · 연관 무드로 시작한 검색 둘 다
  const [isPending, startTransition] = useTransition();
  const elsewhere = useSearchPending();
  const loading = isPending || elsewhere;
  const [borderMotion, setBorderMotion] = useState<SearchBorderMotionState>("idle");
  const [imagePanel, setImagePanel] = useState(false);
  // 손가락 기기는 패널을 띄우지 않는다 — 버튼을 누르면 바로 OS 사진 고르기가 열리고,
  // 거기서 "사진 보관함 / 사진 찍기" 와 사진 접근 권한 동의가 뜬다(docs/46 §3).
  const phoneFileRef = useRef<HTMLInputElement>(null);
  const { accept: acceptImage, error: imageError } = useImageSearchUpload();
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
    // 검색은 늘 맨 위에서 시작한다(사람 요청 2026-10-04) — 같은 말을 다시 검색해도 예전 스크롤 · 피드 세션으로 떨어지지 않게 비우고,
    // 이번 이동을 "새로 보러 감" 으로 표시한다(ScrollMemory 가 최상단에서 시작)
    try {
      searchSessionStorageKeys("/", query).forEach((key) => sessionStorage.removeItem(key));
      sessionStorage.setItem(NAV_FRESH_KEY, "/");
    } catch {
      /* 저장소가 막혀 있어도 검색은 한다 */
    }
    startTransition(() => router.push(searchHref(query), { scroll: true }));
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
        onMouseDown={(event) => {
          // 떠 있는 검색창이 눌려 활성화된 상태에서 한 번 더 누르면 원래(반투명)로 돌아간다(사람 요청 2026-10-05)
          if (appearance === "active" && document.activeElement === event.currentTarget) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        placeholder={displayPlaceholder}
        aria-label="사진 분위기 검색"
        autoComplete="off"
        maxLength={120}
        style={{ borderWidth }}
        // 오른쪽 끝은 카메라 버튼(사진으로 검색) 자리 — 검색 중 고리는 그 왼쪽에 선다
        className={`peer relative z-[1] h-[42px] w-full rounded-md border pl-10 ${loading ? "pr-[4.5rem]" : "pr-12"} text-body-sm outline-none transition-[background-color,border-color,border-width,border-radius,box-shadow,color,backdrop-filter] duration-300 ease-out ${attached ? "rounded-b-none" : ""} hover:border-brand/45 focus:border-brand/55 focus:ring-2 focus:ring-brand/10 ${borderClass} ${
          appearance === "clear"
            ? "bg-transparent text-transparent caret-transparent shadow-none placeholder:text-transparent"
            : appearance === "overlay"
              ? "bg-black/35 text-white caret-white shadow-sm backdrop-blur-sm placeholder:text-white/65"
              : "bg-surface text-fg caret-current shadow-sm placeholder:text-faint"
        }`}
      />
      {loading && (
        <span role="status" aria-label="검색 결과를 불러오는 중" className="pointer-events-none absolute right-12 top-1/2 z-[2] -translate-y-1/2">
          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
        </span>
      )}
      {/* 사진으로 검색 — 자리만 먼저 잡았다. 누르면 사진을 올려 SigLIP 으로 비슷한 사진을 찾는다(작업 중).
          입력칸을 눌러 커서가 생기면 서서히 사라진다(글을 쓰는 동안은 글 검색이다) */}
      <button
        type="button"
        aria-label="사진으로 검색"
        title="사진으로 검색"
        aria-expanded={imagePanel}
        data-image-search-toggle=""
        onClick={() => {
          if (prefersNativePicker()) phoneFileRef.current?.click();
          else setImagePanel((open) => !open);
        }}
        // 누르는 자리를 검색창 높이만큼 준다 — 32px 사각형은 엄지로 자주 빗나갔다
        className={`samae-search-camera absolute right-1 top-1/2 z-[2] grid h-[38px] w-11 -translate-y-1/2 place-items-center rounded-md ${
          appearance === "overlay" ? "text-white/75 hover:text-white" : "text-muted hover:text-brand"
        }`}
      >
        <CameraIcon className="h-5 w-5" />
      </button>
      {imagePanel && <ImageSearchPanel onClose={() => setImagePanel(false)} />}
      {/* 손가락 기기 전용 — accept 만 두고 capture 는 두지 않는다. capture 를 주면
          사진 보관함이 사라지고 카메라만 열린다. 둘 다 고를 수 있어야 한다. */}
      <input
        ref={phoneFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void acceptImage(event.target.files?.[0]);
          event.target.value = "";   // 같은 사진을 다시 골라도 열리게
        }}
      />
      {imageError && !imagePanel && (
        <p role="status" className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg bg-surface px-3 py-2 text-caption text-danger shadow">
          {imageError}
        </p>
      )}
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
