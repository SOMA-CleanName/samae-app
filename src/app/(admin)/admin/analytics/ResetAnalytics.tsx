"use client";

import { useActionState, useState } from "react";
import { clearAnalytics, type ResetState } from "./actions";

// 분석 데이터 초기화 — 버튼 → 비밀번호 입력 → 전체 삭제
export function ResetAnalytics() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ResetState, FormData>(clearAnalytics, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
      >
        데이터 초기화
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="password"
        name="password"
        placeholder="비밀번호"
        autoComplete="off"
        className="w-32 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-full bg-danger px-3 py-1.5 text-caption font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "삭제 중…" : "전체 삭제"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="cursor-pointer rounded-full px-2 py-1.5 text-caption text-muted hover:text-fg"
      >
        취소
      </button>
      {state.error && <span className="text-caption text-danger">{state.error}</span>}
      {state.ok && <span className="text-caption text-success">초기화됐어요.</span>}
    </form>
  );
}
