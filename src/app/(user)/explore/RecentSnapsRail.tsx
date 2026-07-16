"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { RecentPost } from "@/lib/explore-db";

const STEP_MS = 2800;
const ADVANCE_MS = 9600; // 가로 자동 넘김 주기(다음 카드로)

// 새로 올라온 스냅 레일 — 각 카드가 그 게시물 사진들을 sort_order 순으로 크로스페이드하며 순환.
// 한 타이머로 tick 을 올리고, 카드별 index 오프셋으로 서로 어긋나게(덜 기계적으로) 넘긴다.
export function RecentSnapsRail({ posts }: { posts: RecentPost[] }) {
  const [tick, setTick] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  // 카드 내부 5장 크로스페이드
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, []);

  // 가로 자동 넘김 — 다음 카드로 스크롤, 끝에 닿으면 처음으로 루프.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const track = railRef.current;
      if (!track) return;
      const first = track.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 10 : track.clientWidth * 0.5; // 카드폭 + gap(2.5)
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative -mx-2.5 sm:-mx-4">
      <div
        ref={railRef}
        className="flex gap-2.5 overflow-x-auto px-2.5 pb-1 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      {posts.map((post, i) => {
        const len = Math.max(1, post.shots.length);
        const active = (tick + i) % len;
        return (
          <Link
            key={post.id}
            href={`/photos/${post.id}`}
            className="group relative aspect-[3/4] w-[54vw] max-w-72 shrink-0 overflow-hidden bg-fg/[0.06]"
          >
            {/* 사진 (앨범 순서대로 크로스페이드) */}
            <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
              {post.shots.map((sh, si) => (
                <Image
                  key={sh.id}
                  src={sh.url}
                  alt=""
                  fill
                  quality={80}
                  sizes="(max-width: 640px) 54vw, 288px"
                  className={cn(
                    "object-cover transition-opacity duration-[900ms]",
                    si === active ? "opacity-100" : "opacity-0"
                  )}
                />
              ))}
            </div>
          </Link>
        );
      })}
      </div>

      {/* 오른쪽 페이드 — 사진 끝(오른쪽)으로 갈수록 어둡게 + 살짝 모자이크(블러). 왼쪽 45% 까지는 효과 없음. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-black/70 backdrop-blur-[1px]"
        style={{
          maskImage: "linear-gradient(to right, transparent, transparent 45%, #000)",
          WebkitMaskImage: "linear-gradient(to right, transparent, transparent 45%, #000)",
        }}
      />
    </div>
  );
}
