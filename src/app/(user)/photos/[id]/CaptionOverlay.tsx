"use client";

// 작가의 글 — 사진 위에 겹쳐서 본다.
//
// 글을 사진 아래 카드로 두면 사진을 보다가 시선을 옮겨야 하고, 정작 무엇을 두고 하는
// 이야기인지 다시 위를 봐야 한다. 사진 위에 얹으면 글과 대상이 한 화면에 있다.
//
// 기본은 감춰둔다 — 전환 동선(가격·CTA)을 가리지 않아야 하고, 읽고 싶은 사람만 연다.
// 버튼은 공유·담기와 같은 줄에 둔다(사진에 대한 행동끼리 모아둔다).

import { createContext, useContext, useState } from "react";

const CaptionCtx = createContext<{
  open: boolean;
  toggle: () => void;
  close: () => void;
  caption: string | null;
} | null>(null);

export function CaptionProvider({
  caption,
  children,
}: {
  caption: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <CaptionCtx.Provider
      value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false), caption }}
    >
      {children}
    </CaptionCtx.Provider>
  );
}

/** 공유·담기 옆 버튼 — 글이 없으면 아예 그리지 않는다 */
export function CaptionToggleButton() {
  const ctx = useContext(CaptionCtx);
  if (!ctx?.caption) return null;
  return (
    <button
      type="button"
      onClick={ctx.toggle}
      aria-pressed={ctx.open}
      aria-label="작가의 글"
      className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors ${
        ctx.open ? "bg-fg text-bg" : "text-fg/70 hover:bg-fg/[0.06] hover:text-fg"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"
          strokeLinejoin="round"
        />
        <path d="M8 8.5h8M8 12h5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** 사진 위에 겹치는 글 — 사진 컨테이너(relative) 안에 둔다 */
export function CaptionOverlay() {
  const ctx = useContext(CaptionCtx);
  if (!ctx?.caption) return null;
  return (
    <div
      onClick={ctx.close}
      aria-hidden={!ctx.open}
      inert={!ctx.open}
      className={`absolute inset-0 flex items-end justify-end p-3 transition-opacity duration-300 sm:p-4 ${
        ctx.open ? "cursor-pointer opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* 사진을 완전히 덮지 않는다 — 무엇에 대한 글인지 보이는 채로 읽혀야 한다 */}
      <div className="absolute inset-0 bg-black/45" />
      <p
        className={`relative max-h-[70%] max-w-[92%] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-black/45 p-3.5 text-body-sm leading-relaxed text-white backdrop-blur-sm transition-transform duration-300 sm:max-w-[80%] ${
          ctx.open ? "translate-y-0" : "translate-y-2"
        }`}
      >
        {ctx.caption}
      </p>
    </div>
  );
}
