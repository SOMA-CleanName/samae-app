"use client";

import { useState } from "react";

// 취향 테스트 진입 카드 — 목업의 개인화 훅. 실제 퀴즈 플로우(사진 선택→개인화 피드)는 후속 작업.
// 지금은 진입 CTA + '준비 중' 안내만.
export function TasteTestCard() {
  const [teased, setTeased] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card">
      <p className="font-display text-body-sm italic text-brand">30초면 끝</p>
      <h3 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight [text-wrap:balance]">
        네 취향 스냅만
        <br />
        모아서 보여줄게
      </h3>
      <p className="mt-2.5 max-w-[92%] text-body-sm leading-relaxed text-muted">
        사진 몇 장만 골라주면, 너한테 딱 맞는 작가와 무드를 추려서 피드를 새로 짜줘요.
      </p>

      {teased ? (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2.5 text-body-sm font-semibold text-brand-ink">
          🙌 곧 열려요 · 준비 중이에요
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setTeased(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-body-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          취향 테스트 시작
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
