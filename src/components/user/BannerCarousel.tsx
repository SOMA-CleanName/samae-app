"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type BannerItem = {
  id: string;
  src: string;
  alt: string;
  href: string | null;
};

const AUTO_MS = 5000;
const SWIPE_PX = 40;

// 홈·카테고리 상단 배너 캐러셀 — 자동 슬라이드 + 스와이프 + 도트.
// 이미지는 업로드 시 만든 2000px JPG 를 그대로 쓴다(next/image 최적화는 프로젝트 전역 off).
export function BannerCarousel({ items }: { items: BannerItem[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = items.length;

  const go = useCallback(
    (next: number) => setIdx(((next % count) + count) % count),
    [count]
  );

  // 자동 넘김 — 1장이거나 정지 상태(호버·스와이프 중)면 멈춘다. 모션 최소화 설정도 존중.
  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), AUTO_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 0) return null;

  return (
    // 풀블리드 — 페이지 섹션의 좌우·상단 패딩(px-2.5 pt-2.5 / sm:px-4 sm:pt-4)을 음수 마진으로 상쇄한다.
    <div className="-mx-2.5 -mt-2.5 mb-3 sm:-mx-4 sm:-mt-4 sm:mb-4">
      <div
        className="relative overflow-hidden bg-surface"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
          setPaused(true);
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          setPaused(false);
          if (start == null || count < 2) return;
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) >= SWIPE_PX) go(idx + (dx < 0 ? 1 : -1));
        }}
      >
        {/* 트랙 — 전체를 가로로 이어붙이고 translateX 로 이동 */}
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {items.map((b, i) => {
            const img = (
              <Image
                src={b.src}
                alt={b.alt}
                fill
                sizes="100vw"
                priority={i === 0}
                className="object-cover"
              />
            );
            // sm:max-h — 초광폭 모니터에서 배너만 화면을 다 먹지 않도록 높이 상한
            return (
              <div
                key={b.id}
                className="relative aspect-[16/9] w-full shrink-0 sm:aspect-[21/9] sm:max-h-[520px]"
              >
                {b.href ? (
                  <Link
                    href={b.href}
                    aria-hidden={i !== idx}
                    tabIndex={i === idx ? 0 : -1}
                    className="absolute inset-0 block"
                  >
                    {img}
                  </Link>
                ) : (
                  img
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* 도트 — 사진 아래. 현재/비현재 차이는 색만(크기·모양 동일). 2장 이상일 때만 */}
      {count > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {items.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`${i + 1}번째 배너 보기`}
              aria-current={i === idx ? "true" : undefined}
              onClick={() => go(i)}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === idx ? "bg-fg" : "bg-line-strong hover:bg-fg/40"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
