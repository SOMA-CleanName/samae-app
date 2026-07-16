"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearTaste } from "./explore/quiz/actions";

// 홈 상단 — 취향 적용 중임을 알리고 초기화 제공. (취향 쿠키가 있을 때만 렌더)
export function TasteBanner({ tags }: { tags: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const reset = () =>
    start(async () => {
      await clearTaste();
      router.refresh();
    });

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand-soft px-4 py-3">
      <p className="min-w-0 truncate text-body-sm font-semibold text-brand-ink">
        ✨ 취향 적용 중{" "}
        <span className="font-normal">{tags.map((t) => `#${t}`).join(" ")}</span>
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
