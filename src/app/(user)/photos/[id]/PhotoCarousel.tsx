"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";

type P = { id: string; src_url: string; thumb_url: string | null };

// 썸네일(이미 캐시됨)을 즉시 보여주고, 원본이 다 받아지면 부드럽게 교체
function Slide({ p }: { p: P }) {
  const [src, setSrc] = useState(p.thumb_url ?? p.src_url);
  const isThumb = src !== p.src_url;

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
    <img
      src={src}
      alt=""
      className={`w-full object-contain transition-[filter] duration-300 md:max-h-[82vh] ${
        isThumb ? "blur-[6px]" : "blur-0"
      }`}
    />
  );
}

// 게시물 사진 스와이프 캐러셀 — 스크롤 스냅(터치 스와이프) + 좌우 버튼 + 점 인디케이터
export function PhotoCarousel({ photos, startIndex = 0 }: { photos: P[]; startIndex?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(startIndex);

  // 시작 사진으로 이동 (애니메이션 없이)
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

  if (photos.length <= 1) {
    // §2-1 배경 제거 — 페이지 기본 배경에 사진이 그대로 얹히도록(핀터레스트식)
    return (
      <div className="overflow-hidden rounded-2xl">
        <Slide p={photos[0]} />
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-2xl scrollbar-none"
      >
        {photos.map((p) => (
          <div key={p.id} className="w-full shrink-0 snap-center">
            <Slide p={p} />
          </div>
        ))}
      </div>

      {/* 좌우 버튼 */}
      {idx > 0 && (
        <button
          type="button"
          onClick={() => go(idx - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white hover:bg-black/55"
          aria-label="이전 사진"
        >
          ‹
        </button>
      )}
      {idx < photos.length - 1 && (
        <button
          type="button"
          onClick={() => go(idx + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white hover:bg-black/55"
          aria-label="다음 사진"
        >
          ›
        </button>
      )}

      {/* 카운터 + 점 */}
      <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-xs text-white">
        {idx + 1}/{photos.length}
      </span>
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {photos.map((p, i) => (
          <span
            key={p.id}
            className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
