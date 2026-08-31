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
  /**
   * 이미지 위에 얹을 글. 아티클처럼 **배너용으로 만들어진 이미지가 아닌 것**에 쓴다.
   *
   * 운영자가 올린 배너는 글자까지 들어간 완성 이미지라 아무것도 얹지 않는다.
   * 반대로 아티클 커버는 그냥 사진이라, 제목이 없으면 왜 눌러야 하는지 알 수 없다.
   */
  kicker?: string;
  title?: string;
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
    // 좌우만 풀블리드 — 페이지 섹션의 가로 패딩(px-2.5 / sm:px-4)을 음수 마진으로 상쇄한다.
    // 위쪽은 당기지 않는다. 배너가 소개글(FeedHero) 아래로 내려가면서
    // 상단 음수 마진이 소개글을 파고들기 때문.
    <div className="-mx-2.5 mb-3 sm:-mx-4 sm:mb-4">
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
              <>
                <Image
                  src={b.src}
                  alt={b.alt}
                  fill
                  sizes="100vw"
                  priority={i === 0}
                  className="object-cover"
                />
                {b.title && (
                  <>
                    {/* 사진을 통째로 덮지 않는다. 글이 앉는 아래쪽만 어둡게 깐다. */}
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/72 via-black/32 to-transparent"
                    />
                    <span className="absolute inset-x-0 bottom-0 block p-4 sm:p-7">
                      {b.kicker && (
                        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                          {b.kicker}
                        </span>
                      )}
                      <span className="mt-1.5 block max-w-2xl text-[clamp(1.05rem,2.6vw,1.9rem)] font-extrabold leading-[1.18] tracking-[-0.03em] text-white">
                        {b.title}
                      </span>
                    </span>
                  </>
                )}
              </>
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
