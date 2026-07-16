"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { mpTrack } from "@/lib/mixpanel";
import styles from "./explore.module.css";

export type CoverCat = {
  slug: string;
  title: string;
  subtitle: string;
  shots: { id: string; url: string }[];
};

const STEP_MS = 2600;

// 무빙 커버 캐러셀 — 카테고리별로 사진 몇 장을 크로스페이드하고, 다 돌면 다음 카테고리로 슬라이드.
// 사용자가 좌우로 스와이프/드래그해 카테고리를 직접 넘길 수 있다(조작 중엔 자동넘김 잠깐 멈춤).
export function MovingCoverCarousel({ cats }: { cats: CoverCat[] }) {
  // (카테고리, 사진) 타임라인으로 펼쳐 한 포인터로 진행. 카테고리 경계에서 슬라이드가 일어난다.
  const steps = useMemo(
    () => cats.flatMap((c, ci) => c.shots.map((_, si) => ({ ci, si }))),
    [cats]
  );
  // 각 카테고리의 시작 step 인덱스(스와이프 시 점프용)
  const catStart = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const c of cats) {
      arr.push(acc);
      acc += Math.max(1, c.shots.length);
    }
    return arr;
  }, [cats]);

  const [step, setStep] = useState(0);
  const pausedUntil = useRef(0);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (steps.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setStep((s) => (s + 1) % steps.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  if (cats.length === 0) return null;
  const cur = steps[step] ?? { ci: 0, si: 0 };
  const active = cats[cur.ci];

  const goToCat = (dir: number) => {
    const n = cats.length;
    const target = (cur.ci + dir + n) % n;
    setStep(catStart[target] ?? 0);
    pausedUntil.current = Date.now() + 6000; // 조작 후 6초 자동넘김 멈춤
  };

  return (
    <Link
      href={`/explore/${active.slug}`}
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        startX.current = e.clientX;
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        if (startX.current !== null && Math.abs(e.clientX - startX.current) > 8) {
          dragged.current = true;
        }
      }}
      onPointerUp={(e) => {
        if (startX.current !== null) {
          const dx = e.clientX - startX.current;
          if (dx <= -40) goToCat(1);
          else if (dx >= 40) goToCat(-1);
        }
        startX.current = null;
      }}
      onClick={(e) => {
        // 드래그였으면 링크 이동 막기(스와이프와 탭 구분)
        if (dragged.current) {
          e.preventDefault();
          return;
        }
        mpTrack("Click Explore Category", {
          category: active.title,
          slug: active.slug,
          rank: cur.ci + 1,
          source: "cover",
        });
      }}
      className={`${styles.reveal} group relative mt-4 block aspect-[4/5] cursor-grab select-none overflow-hidden rounded-2xl bg-fg/[0.06] active:cursor-grabbing`}
    >
      {/* 슬라이드 트랙 — 카테고리 패널을 가로로 늘어놓고 translateX 로 이동 */}
      <div
        className="absolute inset-0 flex h-full transition-transform duration-700 ease-[cubic-bezier(.6,.05,.2,1)]"
        style={{
          width: `${cats.length * 100}%`,
          transform: `translateX(-${(cur.ci * 100) / cats.length}%)`,
        }}
      >
        {cats.map((c, ci) => {
          const activeShot = ci === cur.ci ? cur.si : 0;
          return (
            <div key={c.slug} className="relative h-full" style={{ width: `${100 / cats.length}%` }}>
              {c.shots.map((sh, i) => (
                <Image
                  key={sh.id}
                  src={sh.url}
                  alt=""
                  fill
                  quality={90}
                  priority={ci === 0 && i === 0}
                  draggable={false}
                  sizes="(max-width: 640px) 100vw, 430px"
                  className={cn(
                    "object-cover transition-opacity duration-[900ms]",
                    i === activeShot ? "opacity-100" : "opacity-0"
                  )}
                />
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-x-4 bottom-7 text-white">
                {c.subtitle && (
                  <p className="mb-1.5 font-display text-body-sm italic text-white/85">{c.subtitle}</p>
                )}
                <h2 className="text-2xl font-extrabold leading-tight tracking-tight [text-wrap:balance]">
                  {c.title}
                </h2>
              </div>
            </div>
          );
        })}
      </div>

      {/* 상단 라벨(고정) */}
      <span className="absolute left-3.5 top-3.5 rounded-full bg-white px-3 py-1 font-display text-caption italic font-semibold text-[#150c0a]">
        This Week · 커버
      </span>

      {/* 카테고리 진행 도트(고정) */}
      <div className="absolute right-3.5 top-4 flex gap-1.5">
        {cats.map((c, ci) => (
          <span
            key={c.slug}
            className={cn(
              "h-1.5 rounded-full bg-white transition-all duration-300",
              ci === cur.ci ? "w-4 opacity-100" : "w-1.5 opacity-45"
            )}
          />
        ))}
      </div>

      {/* 사진 진행 세그먼트 바(고정) — 현재 카테고리 사진 수만큼 나눠 채워지고, 다 차면 다음 카테고리로 */}
      <div className="absolute inset-x-3.5 bottom-3.5 flex gap-1">
        {active.shots.map((sh, i) => (
          <span key={sh.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            {i < cur.si ? (
              <span className="block h-full w-full bg-white" />
            ) : i === cur.si ? (
              <span key={step} className={styles.fill} style={{ animationDuration: `${STEP_MS}ms` }} />
            ) : null}
          </span>
        ))}
      </div>
    </Link>
  );
}
