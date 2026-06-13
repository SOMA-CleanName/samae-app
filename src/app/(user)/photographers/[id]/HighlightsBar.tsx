"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { Highlight } from "@/lib/highlights";

const STORY_MS = 4000; // 한 장 노출 시간

function coverOf(h: Highlight): string | null {
  if (h.cover_url) return h.cover_url;
  if (h.cover_photo_id) {
    const f = h.items.find((it) => it.photo_id === h.cover_photo_id);
    if (f) return f.thumb_url ?? f.src_url;
  }
  return h.items[0]?.thumb_url ?? h.items[0]?.src_url ?? null;
}

// 프로필 상단 하이라이트 줄 + 스토리 뷰어
export function HighlightsBar({
  highlights,
  cta,
}: {
  highlights: Highlight[];
  cta?: React.ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null); // 열린 하이라이트 인덱스
  if (highlights.length === 0) return null;

  return (
    <div className="border-b border-fg/8 pb-5">
      <div className="flex gap-4 overflow-x-auto pb-1">
        {highlights.map((h, i) => {
          const cover = coverOf(h);
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setOpen(i)}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-fg/[0.06] ring-2 ring-fg/15 ring-offset-2 ring-offset-bg">
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="text-fg/30">★</span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px] text-fg/70">
                {h.title || "하이라이트"}
              </span>
            </button>
          );
        })}
      </div>

      {open !== null && (
        <StoryViewer
          highlights={highlights}
          startIndex={open}
          cta={cta}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function StoryViewer({
  highlights,
  startIndex,
  cta,
  onClose,
}: {
  highlights: Highlight[];
  startIndex: number;
  cta?: React.ReactNode;
  onClose: () => void;
}) {
  const [hi, setHi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = highlights[hi];
  const item = current?.items[si];

  // 다음/이전 한 장
  function next() {
    if (!current) return onClose();
    if (si < current.items.length - 1) setSi(si + 1);
    else if (hi < highlights.length - 1) {
      setHi(hi + 1);
      setSi(0);
    } else onClose();
  }
  function prev() {
    if (si > 0) setSi(si - 1);
    else if (hi > 0) {
      const ph = highlights[hi - 1];
      setHi(hi - 1);
      setSi(Math.max(0, ph.items.length - 1));
    }
  }

  // 키보드 네비
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hi, si]);

  // 길게 누르면 일시정지 (탭과 구분)
  function onDown() {
    setPaused(true);
    held.current = false;
    holdTimer.current = setTimeout(() => (held.current = true), 220);
  }
  function onUp(action: () => void) {
    setPaused(false);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (held.current) {
      held.current = false;
      return; // 길게 누른 것 → 네비 무시
    }
    action();
  }

  if (!current || !item) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <style>{`@keyframes hl-grow{from{width:0%}to{width:100%}}`}</style>

      {/* 진행바 */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-3 pt-3">
        {current.items.map((it, idx) => (
          <span key={it.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              key={`${hi}-${si}-${idx}`}
              onAnimationEnd={idx === si ? next : undefined}
              style={
                idx === si
                  ? { animation: `hl-grow ${STORY_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }
                  : undefined
              }
              className={`block h-full bg-white ${idx < si ? "w-full" : idx > si ? "w-0" : ""}`}
            />
          </span>
        ))}
      </div>

      {/* 헤더 */}
      <div className="absolute inset-x-0 top-5 z-10 flex items-center justify-between px-4 pt-2 text-white">
        <span className="text-sm font-semibold drop-shadow">{current.title || "하이라이트"}</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-2xl leading-none drop-shadow">
          ✕
        </button>
      </div>

      {/* 이미지 */}
      <div className="relative flex flex-1 items-center justify-center">
        <img src={item.src_url} alt="" className="max-h-full max-w-full object-contain" />

        {/* 탭 영역 — 왼쪽 이전 / 오른쪽 다음 (길게 누르면 일시정지) */}
        <button
          type="button"
          aria-label="이전"
          className="absolute inset-y-0 left-0 w-1/3"
          onPointerDown={onDown}
          onPointerUp={() => onUp(prev)}
          onPointerLeave={() => setPaused(false)}
        />
        <button
          type="button"
          aria-label="다음"
          className="absolute inset-y-0 right-0 w-2/3"
          onPointerDown={onDown}
          onPointerUp={() => onUp(next)}
          onPointerLeave={() => setPaused(false)}
        />
      </div>

      {/* 하단 CTA */}
      {cta && (
        <div className="z-10 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
          <div className="mx-auto max-w-md">{cta}</div>
        </div>
      )}
    </div>
  );
}
