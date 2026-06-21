"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui";

export type InquiryMediaItem = {
  id: string;
  src: string | null;
  label: string;
};

// 문의 폼 왼쪽 미디어 패널 — 사진 문의는 단일 사진, 작가/패키지 문의는 게시물 대표 사진 캐러셀.
export function InquiryMediaPanel({
  items,
  name,
  avatarUrl,
}: {
  items: InquiryMediaItem[];
  name: string;
  avatarUrl?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const visibleItems = items.filter((item) => item.src);
  const current = visibleItems[index] ?? null;
  const canSlide = visibleItems.length > 1;

  useEffect(() => {
    setIndex(0);
  }, [items]);

  function move(delta: number) {
    if (!canSlide) return;
    setIndex((value) => (value + delta + visibleItems.length) % visibleItems.length);
  }

  return (
    <div className="relative min-h-80 bg-fg/[0.04] md:min-h-full">
      {current?.src ? (
        // 모바일: 고정 높이 박스라 잘리지 않게 전체 사진 표시(contain) · 데스크톱: 긴 사이드 패널 채우기(cover)
        <img
          src={current.src}
          alt={current.label}
          className="absolute inset-0 h-full w-full object-contain md:object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-fg/[0.04]">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-bg text-3xl font-semibold text-fg/45 shadow-sm">
            {name.slice(0, 1)}
          </div>
        </div>
      )}

      {canSlide && (
        <>
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="이전 사진"
            className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="다음 사진"
            className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
          >
            <ChevronRightIcon />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2 py-1 backdrop-blur-sm">
            {visibleItems.map((item, dotIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(dotIndex)}
                aria-label={`${dotIndex + 1}번째 사진 보기`}
                className={`h-1.5 rounded-full transition-all ${
                  dotIndex === index ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* 작가 정보 — 사진 오른쪽 하단 오버레이 */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 backdrop-blur-sm">
        <Avatar src={avatarUrl} name={name} size="sm" className="ring-1 ring-white/50" />
        <span className="text-caption font-semibold text-white">{name}</span>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M10 3 5 8l5 5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="m6 3 5 5-5 5" />
    </svg>
  );
}
