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
const HOLD_MS = 180; // 이 이상 누르고 있으면 '꾹 눌러 일시정지'
const MOVE_PX = 8; // 이만큼 움직이면 드래그(스와이프 후보)로 판정
const SWIPE_PX = 40; // 이만큼 가로로 밀면 카테고리 전환
// 카드 폭(컨테이너 대비 %) — 100 미만이면 양옆 이웃 카드가 (100-SLIDE_W)/2 씩 삐져나온다.
const SLIDE_W = 80;

// 무빙 커버 캐러셀 — 인스타 스토리식 조작:
//  · 좌/우 탭 = 이전/다음 사진   · 꾹 누름 = 일시정지(떼면 남은 시간부터 재개)
//  · 좌우 스와이프 = 이전/다음 카테고리   · 제목 탭 = 그 카테고리 열기
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
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const pausedRef = useRef(false);
  const remaining = useRef(STEP_MS); // 현재 step 남은 시간(일시정지 재개용)
  const stepStart = useRef(0);

  // 자동넘김 — 항상 2초. 꾹 누름(paused)이면 멈추고, 떼면 남은 시간부터 이어서 진행.
  useEffect(() => {
    if (steps.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (paused) return;
    stepStart.current = Date.now();
    const id = window.setTimeout(() => {
      remaining.current = STEP_MS; // 다음 step 은 처음부터
      setStep((s) => (s + 1) % steps.length);
    }, remaining.current);
    return () => {
      window.clearTimeout(id);
      // 일시정지로 멈춘 경우에만 남은 시간 저장 (step 변경 정리 땐 건드리지 않음)
      if (pausedRef.current) {
        remaining.current = Math.max(120, remaining.current - (Date.now() - stepStart.current));
      }
    };
  }, [step, paused, steps.length]);

  // 언마운트 시 홀드 타이머 정리
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  if (cats.length === 0) return null;
  const cur = steps[step] ?? { ci: 0, si: 0 };

  // step 이동 시엔 항상 남은 시간을 처음(STEP_MS)으로 리셋
  const goTo = (index: number) => {
    remaining.current = STEP_MS;
    setStep(index);
  };
  const stepPhoto = (dir: number) => goTo((step + dir + steps.length) % steps.length);
  const goToCat = (dir: number) => {
    const n = cats.length;
    const target = (cur.ci + dir + n) % n;
    goTo(catStart[target] ?? 0);
  };

  // ── 제스처: 탭(좌/우 넘김) · 꾹(일시정지) · 스와이프(카테고리) ──
  function onDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); // 밖으로 나가도 move/up 유지
    startX.current = e.clientX;
    dragged.current = false;
    holdTimer.current = window.setTimeout(() => {
      if (!dragged.current) {
        pausedRef.current = true;
        setPaused(true);
      }
    }, HOLD_MS);
  }
  function onMove(e: React.PointerEvent) {
    if (startX.current !== null && Math.abs(e.clientX - startX.current) > MOVE_PX) {
      dragged.current = true;
      window.clearTimeout(holdTimer.current); // 스와이프면 홀드 취소
    }
  }
  function onUp(e: React.PointerEvent) {
    window.clearTimeout(holdTimer.current);
    // 꾹 누르고 있었으면 → 떼는 순간 재개만(넘김 없음)
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      startX.current = null;
      return;
    }
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) >= SWIPE_PX) {
      goToCat(dx < 0 ? 1 : -1); // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
      return;
    }
    // 탭 — 오른쪽 절반=다음 사진, 왼쪽 절반=이전 사진 (인스타 스토리식)
    const rect = e.currentTarget.getBoundingClientRect();
    stepPhoto(e.clientX - rect.left > rect.width / 2 ? 1 : -1);
  }
  function onCancel() {
    window.clearTimeout(holdTimer.current);
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
    }
    startX.current = null;
  }

  return (
    <div className="mt-4">
      <div
        style={{ touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        className={`${styles.reveal} group relative block aspect-[4/5] cursor-pointer select-none overflow-hidden`}
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

                  {/* 제목 = 이 카테고리 열기 (좌/우 탭 넘김과 구분: 포인터 이벤트 전파 차단) */}
                  <Link
                    href={`/explore/${c.slug}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={() =>
                      mpTrack("Click Explore Category", {
                        category: c.title,
                        slug: c.slug,
                        rank: ci + 1,
                        source: "cover",
                      })
                    }
                    className="absolute inset-x-4 bottom-6 text-white"
                  >
                    {c.subtitle && (
                      <p className="mb-1 font-display text-body-sm italic text-white/85">{c.subtitle}</p>
                    )}
                    <h2 className="flex items-center gap-1 text-xl font-extrabold leading-tight tracking-tight [text-wrap:balance]">
                      {c.title}
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 shrink-0 opacity-80"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </h2>
                  </Link>

                  {/* 사진 진행 세그먼트 바 — 탭하면 해당 사진으로 점프. 활성 카드에서만 채워진다. */}
                  <div className="absolute inset-x-3 bottom-3 flex gap-1">
                    {c.shots.map((sh, i) => (
                      <span
                        key={sh.id}
                        role="button"
                        aria-label={`${i + 1}번째 사진 보기`}
                        onPointerDown={(e) => {
                          // 세그먼트 탭은 좌/우 넘김·홀드와 겹치지 않게 전파 차단 후 바로 점프
                          e.stopPropagation();
                          goTo((catStart[ci] ?? 0) + i);
                        }}
                        onPointerUp={(e) => e.stopPropagation()}
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
                            <span
                              key={step}
                              className={styles.fill}
                              style={{
                                animationDuration: `${STEP_MS}ms`,
                                animationPlayState: paused ? "paused" : "running",
                              }}
                            />
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
      </div>
    </div>
  );
}
