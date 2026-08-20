"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { CheckIcon } from "@/components/user/icons";

// 분석 대기 화면.
//
// 이 대기는 짧지 않다 — 스크래핑 + 이미지 다운로드 + 비전 분석이라 20~30초가 든다.
// 스피너 하나로 그 시간을 버티게 하면 사용자는 "멈춘 건가?" 싶어 이탈한다.
// 그래서 실제 파이프라인 단계를 그대로 보여준다. 진행이 눈에 보이면 같은 시간도 짧게 느껴진다.
//
// 단계 전환은 경과 시간 추정이다(서버가 진행률을 스트리밍하지 않으므로).
// 대신 **마지막 단계는 절대 스스로 완료되지 않는다** — 실제 응답이 와야 끝난다.
// 진행바도 95%에서 멈춰 기다린다. 가짜로 100%를 채우고 나서 더 기다리게 하면
// 그게 진짜 배신감을 준다.

type Step = { label: string; seconds: number };

// 실측 기준(2026-08-20): 스크래핑 ~8s · 사진 준비 1.3s · 분석 16.3s.
// 심리와 무드는 이제 한 번의 호출로 함께 나오고(combined.ts),
// 닮은 사진 탐색은 그 뒤에서 병렬로 끝나 대기시간이 0 이다.
const STEPS_INSTAGRAM: Step[] = [
  { label: "공개 피드를 불러오는 중", seconds: 8 },
  { label: "사진을 한 장씩 읽는 중", seconds: 3 },
  { label: "성향과 어울리는 무드를 찾는 중", seconds: 15 },
  { label: "당신과 닮은 사진을 고르는 중", seconds: 999 },
];

const STEPS_UPLOAD: Step[] = [
  { label: "올린 사진을 읽는 중", seconds: 4 },
  { label: "성향과 어울리는 무드를 찾는 중", seconds: 15 },
  { label: "당신과 닮은 사진을 고르는 중", seconds: 999 },
];

export function PersonaLoading({
  method,
  username,
}: {
  method: "instagram" | "upload";
  username?: string;
}) {
  const steps = method === "instagram" ? STEPS_INSTAGRAM : STEPS_UPLOAD;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const iv = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 250);
    return () => window.clearInterval(iv);
  }, []);

  // 경과 시간이 어느 단계에 해당하는지
  let current = 0;
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].seconds;
    if (elapsed < acc) {
      current = i;
      break;
    }
    current = steps.length - 1;
  }

  const total = steps.slice(0, -1).reduce((s, x) => s + x.seconds, 0);
  const progress = Math.min(95, (elapsed / (total + 8)) * 100);
  const target = method === "instagram" ? `@${username}` : "올린 사진";

  return (
    // 셸의 <main pb-28> 만큼 빼야 화면이 넘치지 않는다
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-md flex-col justify-center px-6 py-12 font-kr">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <p className="font-display text-body-sm italic text-brand">samae · 촬영 페르소나</p>
        <h1 className="mt-1.5 text-h2 font-bold">
          {target}의 미감을 읽고 있어요
        </h1>
        <p className="mt-1.5 text-body-sm text-muted">
          보통 20~30초 걸려요. 이 화면을 닫지 말고 잠시만 기다려 주세요.
        </p>

        {/* 진행바 — 95%에서 멈춰 실제 응답을 기다린다 */}
        <div
          className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="분석 진행률"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 실제 파이프라인 단계 */}
        <ol className="mt-5 space-y-3">
          {steps.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-300 " +
                    (done
                      ? "bg-brand-soft text-brand-ink"
                      : active
                        ? "text-brand"
                        : "text-faint")
                  }
                  aria-hidden
                >
                  {done ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span
                  className={
                    "text-body-sm transition-colors duration-300 " +
                    (active ? "font-semibold text-fg" : done ? "text-muted" : "text-faint")
                  }
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* 초 카운터에 aria-live 를 걸면 250ms 마다 스크린리더가 숫자를 읽어 대화를 덮는다.
          읽어줘야 하는 건 '몇 초'가 아니라 '어느 단계로 넘어갔나'다. */}
      <p aria-hidden className="mt-4 text-center text-caption text-muted">
        {Math.floor(elapsed)}초 경과
      </p>
      <p aria-live="polite" className="sr-only">
        {steps[current].label}
      </p>
    </div>
  );
}
