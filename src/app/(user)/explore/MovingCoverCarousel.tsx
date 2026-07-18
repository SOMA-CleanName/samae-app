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

const STEP_MS = 2000;
// 스와이프 직후 그 step 은 길게 머무름 — 게이지도 같은 길이로 채워져 '찼는데 안 넘어감'이 없다.
const SWIPE_PAUSE_MS = 6000;
// 카드 폭(컨테이너 대비 %) — 100 미만이면 양옆 이웃 카드가 (100-SLIDE_W)/2 씩 삐져나온다.
const SLIDE_W = 80;

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
  // 현재 step 지속시간 — 게이지 채움과 자동넘김이 항상 같은 길이를 쓰게 하는 단일 소스.
  const [stepDur, setStepDur] = useState(STEP_MS);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);

  // step 이 바뀔 때마다 리셋되는 타이머 — stepDur 로 게이지·넘김을 항상 동기화.
  // 스와이프 직후엔 stepDur 이 길어(SWIPE_PAUSE_MS) 게이지도 그만큼 천천히 차므로 '찼는데 안 넘어감'이 없다.
  useEffect(() => {
    if (steps.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => {
      setStep((s) => (s + 1) % steps.length);
      setStepDur(STEP_MS); // 다음 step 부터는 기본 속도로 복귀
    }, stepDur);
    return () => clearTimeout(id);
  }, [step, stepDur, steps.length]);

  if (cats.length === 0) return null;
  const cur = steps[step] ?? { ci: 0, si: 0 };
  const active = cats[cur.ci];

  const goToCat = (dir: number) => {
    const n = cats.length;
    const target = (cur.ci + dir + n) % n;
    setStep(catStart[target] ?? 0);
    setStepDur(SWIPE_PAUSE_MS); // 스와이프한 카테고리를 잠깐 더 보여줌(게이지도 같은 길이)
  };

  return (
    <div className="mt-4">
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
      className={`${styles.reveal} group relative block aspect-[4/5] cursor-grab select-none overflow-hidden active:cursor-grabbing`}
    >
      {/* 슬라이드 트랙 — 카드를 80% 폭으로 늘어놓고 활성 카드를 중앙에 오도록 translateX.
          양옆 이웃 카드가 10%씩 삐져나와 회색·블러로 보인다(coverflow). */}
      <div
        className="absolute inset-0 flex transition-transform duration-700 ease-[cubic-bezier(.6,.05,.2,1)]"
        style={{ transform: `translateX(${10 - cur.ci * SLIDE_W}%)` }}
      >
        {cats.map((c, ci) => {
          const isActive = ci === cur.ci;
          const activeShot = isActive ? cur.si : 0;
          return (
            <div key={c.slug} className="h-full flex-none px-1.5" style={{ width: `${SLIDE_W}%` }}>
              <div
                className={cn(
                  "relative h-full w-full overflow-hidden bg-fg/[0.06] transition-all duration-700 ease-[cubic-bezier(.6,.05,.2,1)]",
                  isActive
                    ? "scale-100 opacity-100"
                    : "scale-[0.92] opacity-80 grayscale blur-[2px] brightness-90"
                )}
              >
                {c.shots.map((sh, i) => (
                  <Image
                    key={sh.id}
                    src={sh.url}
                    alt=""
                    fill
                    quality={90}
                    priority={ci === 0 && i === 0}
                    draggable={false}
                    sizes="(max-width: 640px) 80vw, 360px"
                    className={cn(
                      "object-cover transition-opacity duration-[900ms]",
                      i === activeShot ? "opacity-100" : "opacity-0"
                    )}
                  />
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />


                <div className="absolute inset-x-4 bottom-6 text-white">
                  {c.subtitle && (
                    <p className="mb-1 font-display text-body-sm italic text-white/85">{c.subtitle}</p>
                  )}
                  <h2 className="text-xl font-extrabold leading-tight tracking-tight [text-wrap:balance]">
                    {c.title}
                  </h2>
                </div>

                {/* 사진 진행 세그먼트 바 — 탭하면 해당 사진으로 점프(칸이 채워짐). 활성 카드에서만 채워진다. */}
                <div className="absolute inset-x-3 bottom-3 flex gap-1">
                  {c.shots.map((sh, i) => (
                    <span
                      key={sh.id}
                      role="button"
                      aria-label={`${i + 1}번째 사진 보기`}
                      onPointerDown={(e) => {
                        // click 은 모바일에서 첫 탭이 스와이프로 오인돼 삼켜질 수 있어 pointerdown 에서 바로 점프.
                        e.stopPropagation();
                        setStepDur(STEP_MS); // 탭은 정지 없이 기본 속도로 진행
                        setStep((catStart[ci] ?? 0) + i);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="flex-1 cursor-pointer py-2.5 -my-2.5"
                    >
                      <span className="block h-[3px] overflow-hidden rounded-full bg-white/30">
                        {isActive && i < cur.si ? (
                          <span className="block h-full w-full bg-white" />
                        ) : isActive && i === cur.si ? (
                          <span key={step} className={styles.fill} style={{ animationDuration: `${stepDur}ms` }} />
                        ) : null}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </Link>
    </div>
  );
}
