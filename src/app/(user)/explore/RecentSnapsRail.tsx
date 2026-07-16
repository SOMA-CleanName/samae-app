"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { RecentPost } from "@/lib/explore-db";
import styles from "./explore.module.css";

const STEP_MS = 2800;

// 새로 올라온 스냅 레일 — 각 카드가 그 게시물 사진들을 sort_order 순으로 크로스페이드하며 순환.
// 한 타이머로 tick 을 올리고, 카드별 index 오프셋으로 서로 어긋나게(덜 기계적으로) 넘긴다.
export function RecentSnapsRail({ posts }: { posts: RecentPost[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="-mx-2.5 flex gap-2.5 overflow-x-auto px-2.5 pb-1 sm:-mx-4 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {posts.map((post, i) => {
        const len = Math.max(1, post.shots.length);
        const active = (tick + i) % len;
        return (
          <Link
            key={post.id}
            href={`/photos/${post.id}`}
            className="group relative aspect-[3/4] w-36 shrink-0 overflow-hidden rounded-2xl bg-fg/[0.06]"
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
                  sizes="144px"
                  className={cn(
                    "object-cover transition-opacity duration-[900ms]",
                    si === active ? "opacity-100" : "opacity-0"
                  )}
                />
              ))}
            </div>

            {/* 세그먼트 슬라이딩바 — 사진 안 하단. 사진 개수만큼, 채워지는 동안 그 사진 유지 → 다음 예고 */}
            {post.shots.length > 1 && (
              <>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute inset-x-2 bottom-2 flex gap-1">
                  {post.shots.map((sh, si) => (
                    <span key={sh.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                      {si < active ? (
                        <span className="block h-full w-full bg-white/85" />
                      ) : si === active ? (
                        <span key={active} className={styles.fill} style={{ animationDuration: `${STEP_MS}ms` }} />
                      ) : null}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Link>
        );
      })}
    </div>
  );
}
