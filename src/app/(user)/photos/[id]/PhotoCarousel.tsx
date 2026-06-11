"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { toggleFavorite } from "@/app/(user)/actions";

type P = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  liked?: boolean;
  count?: number;
};

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

// 현재 슬라이드 사진에 대한 좋아요 — 어두운 배경이라 흰 사진 위에서도 보인다.
// 여러 장일 때 '보고 있는 그 사진'만 정확히 좋아요(대표 사진 고정 버그 수정).
function LikeOverlay({ p, pagePath }: { p: P; pagePath: string }) {
  const liked = p.liked ?? false;
  const count = p.count ?? 0;
  return (
    <form
      action={toggleFavorite}
      className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5 backdrop-blur"
    >
      <input type="hidden" name="targetType" value="photo" />
      <input type="hidden" name="targetId" value={p.id} />
      <input type="hidden" name="path" value={pagePath} />
      <input type="hidden" name="next" value={`/photos/${p.id}?like=1`} />
      <button
        type="submit"
        aria-pressed={liked}
        aria-label={liked ? "좋아요 취소" : "좋아요"}
        className={`text-lg leading-none ${liked ? "text-brand" : "text-white"}`}
      >
        {liked ? "♥" : "♡"}
      </button>
      {count > 0 && <span className="text-xs font-semibold text-white">{count}</span>}
    </form>
  );
}

// 게시물 사진 스와이프 캐러셀 — 스크롤 스냅 + 좌우 버튼 + 점 인디케이터 + 슬라이드별 좋아요
export function PhotoCarousel({
  photos,
  startIndex = 0,
  pagePath,
}: {
  photos: P[];
  startIndex?: number;
  pagePath?: string; // 있으면 슬라이드별 좋아요 오버레이 노출 (사진 상세)
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

  // 단일 사진 — 배경 없이 좋아요 오버레이만
  if (photos.length <= 1) {
    return (
      <div className="relative overflow-hidden rounded-2xl">
        <Slide p={photos[0]} />
        {pagePath && <LikeOverlay p={photos[0]} pagePath={pagePath} />}
      </div>
    );
  }

  const cur = photos[Math.max(0, Math.min(photos.length - 1, idx))];

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

      {/* 현재 슬라이드 좋아요 */}
      {pagePath && <LikeOverlay p={cur} pagePath={pagePath} />}

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

      {/* 카운터 */}
      <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-xs text-white">
        {idx + 1}/{photos.length}
      </span>

      {/* 점 인디케이터 — 어두운 알약 배경으로 흰 사진에서도 보이게 */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/30 px-2 py-1">
        {photos.map((p, i) => (
          <span
            key={p.id}
            className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-white" : "bg-white/45"}`}
          />
        ))}
      </div>
    </div>
  );
}
