"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { Highlight } from "@/lib/highlights";
import { StarIcon, XIcon } from "@/components/user/icons";

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
    <div>
      {/* px/py: ring-offset(테두리)이 overflow 컨테이너에 잘리지 않도록 여백 확보 (-mx로 좌측 정렬 유지) */}
      <div className="-mx-1 flex gap-4 overflow-x-auto scrollbar-none px-1 py-1.5">
        {highlights.map((h, i) => {
          const cover = coverOf(h);
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setOpen(i)}
              className="flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1.5"
            >
              <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-fg/[0.06] ring-2 ring-line-strong ring-offset-2 ring-offset-bg">
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <StarIcon className="h-6 w-6 text-faint" />
                )}
              </span>
              <span className="w-full truncate text-center text-caption text-muted">
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
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null); // 하이라이트 전환 슬라이드 방향
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downX = useRef(0);
  const dragging = useRef(false);
  const axis = useRef<"x" | "y" | null>(null); // 드래그 축 잠금
  const downY = useRef(0);
  const [dragX, setDragX] = useState(0); // 가로 드래그(하이라이트 굴리기)
  const [dragY, setDragY] = useState(0); // 세로 드래그(아래로 당겨 닫기)
  const [vw, setVw] = useState(0); // 뷰포트(스토리) 폭 — 회전/임계 계산
  const vpRef = useRef<HTMLDivElement>(null);

  const current = highlights[hi];
  const item = current?.items[si];

  // 다음/이전 한 장 (하이라이트 경계 넘어갈 땐 슬라이드 방향 지정)
  function next() {
    if (!current) return onClose();
    if (si < current.items.length - 1) setSi(si + 1);
    else if (hi < highlights.length - 1) {
      setSlideFrom("right");
      setHi(hi + 1);
      setSi(0);
    } else onClose();
  }
  function prev() {
    if (si > 0) setSi(si - 1);
    else if (hi > 0) {
      const ph = highlights[hi - 1];
      setSlideFrom("left");
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

  // 스토리 뷰포트 폭 측정 (회전 각도/스와이프 임계 계산용)
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    setVw(el.clientWidth);
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 다른 하이라이트로 이동 (스와이프) — 슬라이드 방향 지정
  function gotoHighlight(d: number) {
    const t = hi + d;
    if (t < 0 || t >= highlights.length) return;
    setSlideFrom(d > 0 ? "right" : "left");
    setHi(t);
    setSi(0);
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    axis.current = null;
    setPaused(true);
    held.current = false;
    downX.current = e.clientX;
    downY.current = e.clientY;
    holdTimer.current = setTimeout(() => (held.current = true), 220);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - downX.current;
    const dy = e.clientY - downY.current;
    // 첫 유의미 이동에서 축 잠금 (세로가 우세하고 아래로 → 닫기 / 그 외 → 하이라이트)
    if (axis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dy) > Math.abs(dx) && dy > 0 ? "y" : "x";
    }
    if (axis.current === "y") {
      setDragY(Math.max(0, dy));
    } else if (axis.current === "x") {
      let mx = dx;
      if ((hi === 0 && mx > 0) || (hi === highlights.length - 1 && mx < 0)) mx *= 0.35;
      setDragX(mx);
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    setPaused(false);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const ax = axis.current;
    const dx = dragX;
    const dy = dragY;
    axis.current = null;
    setDragX(0);
    setDragY(0);

    // 아래로 당겨 닫기
    if (ax === "y") {
      if (dy > 110) onClose();
      return;
    }
    // 가로 드래그 → 임계 넘으면 하이라이트 전환
    if (ax === "x") {
      held.current = false;
      const w = vw || vpRef.current?.clientWidth || 400;
      if (Math.abs(dx) > w * 0.2) gotoHighlight(dx < 0 ? 1 : -1);
      return;
    }
    // 탭 (축 미잠금)
    if (held.current) {
      held.current = false;
      return;
    }
    const rect = vpRef.current?.getBoundingClientRect();
    if (rect && e.clientX - rect.left < rect.width / 3) prev();
    else next();
  }
  if (!current || !item) return null;

  // 아래로 당기는 정도에 따른 카드 변형 + 배경 페이드
  const pulling = dragY > 0;
  const cardStyle = {
    transform: pulling
      ? `translateY(${dragY}px) scale(${1 - Math.min(dragY, 320) / 2600})`
      : undefined,
    transition: dragging.current ? "none" : "transform 260ms cubic-bezier(0.22,1,0.36,1)",
    borderRadius: pulling ? "1.5rem" : undefined,
  };
  const backdropOpacity = pulling ? Math.max(0.3, 1 - dragY / 500) : 1;

  return (
    // 데스크톱: 어두운 배경 위 폰 비율 팝업 / 모바일: 전체화면
    <div
      className="fixed inset-0 z-[70] md:grid md:place-items-center md:p-4"
      onClick={onClose}
    >
      {/* 배경 — 아래로 당기면 페이드 */}
      <div
        className="absolute inset-0 bg-black md:bg-black/70"
        style={{ opacity: backdropOpacity, transition: dragging.current ? "none" : "opacity 260ms" }}
      />
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-black md:h-[80vh] md:w-[min(480px,calc(80vh*0.66))] md:rounded-3xl md:shadow-2xl"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes hl-grow{from{width:0%}to{width:100%}}
@keyframes hl-from-right{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes hl-from-left{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>

        {/* 진행바 */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3">
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

        {/* 헤더 — 제목 + 닫기 */}
        <div className="absolute inset-x-0 top-5 z-20 flex items-center justify-between px-4 pt-2 text-white">
          <span className="text-body-sm font-semibold drop-shadow">{current.title || "하이라이트"}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/35 backdrop-blur transition-colors hover:bg-black/55"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* 이미지 — 잡고 끌면 따라오며(3D 회전) 다른 하이라이트로 굴러감. 탭=이미지 이동 */}
        <div
          ref={vpRef}
          className="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden [perspective:1200px]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* 드래그 따라오기 + 회전 / 전환 시 key 변경으로 슬라이드 인 / 놓으면 스냅백 */}
          <div
            key={hi}
            className="absolute inset-0 flex origin-center items-center justify-center [backface-visibility:hidden]"
            style={
              dragging.current
                ? {
                    transform: `translateX(${dragX}px) rotateY(${Math.max(
                      -14,
                      Math.min(14, (-dragX / (vw || 400)) * 14)
                    )}deg)`,
                  }
                : slideFrom
                ? { animation: `hl-from-${slideFrom} 300ms cubic-bezier(0.22,1,0.36,1)` }
                : { transform: "translateX(0) rotateY(0deg)", transition: "transform 260ms cubic-bezier(0.22,1,0.36,1)" }
            }
          >
            <img
              src={item.src_url}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
            />
            <img
              src={item.src_url}
              alt=""
              draggable={false}
              className="relative max-h-full max-w-full object-contain"
            />
          </div>
        </div>

        {/* 하단 CTA */}
        {cta && (
          <div className="z-10 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
            <div className="mx-auto max-w-md">{cta}</div>
          </div>
        )}
      </div>
    </div>
  );
}
