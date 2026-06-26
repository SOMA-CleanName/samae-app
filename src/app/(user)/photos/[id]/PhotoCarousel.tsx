"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/user/icons";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";

type P = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width?: number;
  height?: number;
  liked?: boolean;
  count?: number;
};

// 인스타식 점 인디케이터 — 한 번에 최대 5개만 보여 사진 폭을 넘지 않게.
// 사진이 많으면 현재 위치 중심의 슬라이딩 윈도우, 양끝(더 있음) 점은 작게.
const MAX_DOTS = 5;
function dotWindow(idx: number, total: number): { i: number; scale: number }[] {
  if (total <= MAX_DOTS) return Array.from({ length: total }, (_, i) => ({ i, scale: 1 }));
  let start = idx - Math.floor(MAX_DOTS / 2);
  start = Math.max(0, Math.min(start, total - MAX_DOTS));
  return Array.from({ length: MAX_DOTS }, (_, k) => {
    const i = start + k;
    const moreLeft = start > 0;
    const moreRight = start + MAX_DOTS < total;
    let scale = 1;
    if ((k === 0 && moreLeft) || (k === MAX_DOTS - 1 && moreRight)) scale = 0.5;
    else if ((k === 1 && moreLeft) || (k === MAX_DOTS - 2 && moreRight)) scale = 0.7;
    return { i, scale };
  });
}

// 고정 프레임 안에 사진을 안 잘리게(contain) 넣고, 남는 공간은 같은 사진을 흐리게(blur) 깔아 채운다.
// 썸네일을 즉시 보여주고 원본이 받아지면 부드럽게 교체.
function Slide({ p, alt }: { p: P; alt: string }) {
  const [src, setSrc] = useState(p.thumb_url ?? p.src_url);
  useEffect(() => {
    if (!p.thumb_url || p.thumb_url === p.src_url) {
      setSrc(p.src_url);
      return;
    }
    setSrc(p.thumb_url);
    const full = new window.Image();
    full.src = p.src_url;
    full.onload = () => setSrc(p.src_url);
  }, [p.src_url, p.thumb_url]);

  return (
    <>
      {/* 흐린 배경 채움 — 같은 사진을 blur해 레터박스를 그 사진의 가장자리 색감으로 채움.
          (슬라이드 컨테이너의 overflow-hidden 으로 옆 슬라이드에 번지지 않게 클립) */}
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full scale-125 select-none object-cover blur-2xl"
      />
      {/* 전경 — 안 잘리게 contain. (진입 시 blur→선명 모션 제거: 거슬림) */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="relative h-full w-full select-none object-contain [-webkit-user-drag:none]"
      />
    </>
  );
}

// 현재 슬라이드 사진을 장바구니에 담는 '+' 오버레이 (좋아요 대체)
function CartOverlay({ p }: { p: P }) {
  return (
    <AddToCartButton
      item={{ id: p.id, src: p.thumb_url ?? p.src_url, w: p.width ?? 0, h: p.height ?? 0 }}
      className="absolute right-3 top-3 z-10"
    />
  );
}

// 게시물 사진 스와이프 캐러셀 — 스크롤 스냅 + 좌우 버튼 + 점 인디케이터 + 슬라이드별 좋아요
export function PhotoCarousel({
  photos,
  startIndex = 0,
  pagePath,
  frameAspect = 1,
}: {
  photos: P[];
  startIndex?: number;
  pagePath?: string; // 있으면 슬라이드별 좋아요 오버레이 노출 (사진 상세)
  frameAspect?: number; // 게시물 고정 프레임 비율(대표 사진 기준)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    const el = ref.current;
    if (el && startIndex > 0) el.scrollLeft = startIndex * el.clientWidth;
  }, [startIndex]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  }

  function go(to: number) {
    const el = ref.current;
    if (!el) return;
    const next = Math.max(0, Math.min(photos.length - 1, to));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  // 작가명 노출 금지 — alt 도 익명 처리
  const altFor = (i: number) => (photos.length > 1 ? `사진 ${i + 1}/${photos.length}` : "사진");

  // 단일 사진 — 고정 프레임 + 좋아요 오버레이
  if (photos.length <= 1) {
    return (
      <div
        data-cart-card
        className="relative max-h-[82svh] select-none overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: frameAspect }}
      >
        <Slide p={photos[0]} alt={altFor(0)} />
        {pagePath && <CartOverlay key={photos[0].id} p={photos[0]} />}
      </div>
    );
  }

  const cur = photos[Math.max(0, Math.min(photos.length - 1, idx))];

  return (
    <div className="relative" data-cart-card>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex max-h-[82svh] snap-x snap-mandatory select-none overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth rounded-2xl bg-black scrollbar-none"
        style={{ aspectRatio: frameAspect }}
      >
        {photos.map((p, i) => (
          <div key={p.id} className="relative h-full w-full shrink-0 snap-center overflow-hidden">
            <Slide p={p} alt={altFor(i)} />
          </div>
        ))}
      </div>

      {/* 현재 슬라이드 담기 */}
      {pagePath && <CartOverlay key={cur.id} p={cur} />}

      {/* 좌우 버튼 */}
      {idx > 0 && (
        <button
          type="button"
          onClick={() => go(idx - 1)}
          className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
          aria-label="이전 사진"
        >
          <ChevronLeftIcon />
        </button>
      )}
      {idx < photos.length - 1 && (
        <button
          type="button"
          onClick={() => go(idx + 1)}
          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
          aria-label="다음 사진"
        >
          <ChevronRightIcon />
        </button>
      )}

      {/* 카운터 */}
      <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-xs text-white">
        {idx + 1}/{photos.length}
      </span>

      {/* 점 인디케이터 — 인스타식 최대 5개 윈도우(많아도 사진 폭 안 넘음) */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex max-w-[80%] -translate-x-1/2 items-center justify-center gap-1.5 rounded-full bg-black/30 px-2 py-1">
        {dotWindow(idx, photos.length).map(({ i, scale }) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full transition-all",
              i === idx ? "bg-white" : "bg-white/45"
            )}
            style={{ transform: `scale(${scale})` }}
          />
        ))}
      </div>
    </div>
  );
}
