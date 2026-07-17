"use client";

import { useTransition } from "react";
import { clearTaste } from "./explore/quiz/actions";

// 홈 상단 — 취향 적용 중임을 알리고 초기화 제공. (취향 쿠키가 있을 때만 렌더)
export function TasteBanner() {
  const [pending, start] = useTransition();

  // 초기화 — 취향 쿠키 삭제 + 홈 피드 캐시(취향 반영분) 비우고 풀 리로드 → 홈 완전 초기화.
  const reset = () =>
    start(async () => {
      await clearTaste();
      try {
        Object.keys(sessionStorage)
          .filter((k) => k.startsWith("samae:gallery-session:"))
          .forEach((k) => sessionStorage.removeItem(k));
      } catch {
        /* 무시 */
      }
      window.location.href = "/";
    });

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand-soft px-4 py-3">
      <p className="min-w-0 truncate text-body-sm font-semibold text-brand-ink">
        ✨ 내 취향으로 보는 중
      </p>
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className="shrink-0 rounded-full border border-brand/30 px-3 py-1 text-caption font-semibold text-brand-ink transition-colors hover:bg-brand/10 disabled:opacity-60"
      >
        {pending ? "…" : "초기화"}
      </button>
    </div>
  );
}
