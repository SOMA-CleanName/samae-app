"use client";

import { useEffect, useRef, useState } from "react";

const WIDTH = 224; // 말풍선 너비 (px)
const MARGIN = 8; // 화면 가장자리 여백

// 물음표 도움말 — 호버(데스크톱)/클릭(터치)로 안내 말풍선 표시.
// 말풍선은 fixed로 띄워 모달의 overflow 클리핑을 벗어나고, 화면 가로 경계에 맞춰 위치 보정.
export function HelpTip({
  children,
  label = "도움말",
  placement = "bottom",
}: {
  children: React.ReactNode;
  label?: string;
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 버튼 기준으로 말풍선 좌표 계산 (가로는 화면 안으로 클램프)
  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(
      MARGIN,
      Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - MARGIN),
    );
    const top = placement === "top" ? r.top - 6 : r.bottom + 6;
    setCoords({ left, top });
  }

  function show() {
    place();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // 스크롤·리사이즈 시 위치가 어긋나므로 닫음
    function onMove() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full border border-fg/25 text-[10px] font-semibold leading-none text-fg/50 transition-colors hover:border-fg/45 hover:text-fg/80"
      >
        ?
      </button>
      {open && coords && (
        <span
          role="tooltip"
          style={{
            left: coords.left,
            top: coords.top,
            width: WIDTH,
            transform: placement === "top" ? "translateY(-100%)" : undefined,
          }}
          className="fixed z-[70] rounded-lg bg-fg px-3 py-2 text-[11px] font-normal leading-relaxed text-bg shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
