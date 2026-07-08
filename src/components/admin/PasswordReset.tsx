"use client";

import { useActionState, useState } from "react";

export type ResetState = { error?: string; ok?: boolean };

// 비밀번호 확인형 초기화 버튼 — 어드민 공용 (분석·문의·거래 등)
// 파괴적 작업이므로 폼 열림 시 경고 문구 + 대상 건수(count)를 노출한다.
export function PasswordReset({
  action,
  label = "데이터 초기화",
  confirmLabel = "전체 삭제",
  okText = "초기화됐어요.",
  count,
  warning,
}: {
  action: (prev: ResetState, fd: FormData) => Promise<ResetState>;
  label?: string;
  confirmLabel?: string;
  okText?: string;
  /** 삭제 대상 건수 — 넘기면 경고에 "N건이 삭제돼요" 표시 */
  count?: number;
  /** 경고 문구 커스텀 (기본: 되돌릴 수 없음 안내) */
  warning?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ResetState, FormData>(action, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-2 rounded-xl border border-danger/30 bg-danger/[0.04] p-3">
      <p className="text-caption text-danger">
        ⚠️ {warning ?? "이 작업은 되돌릴 수 없어요. 라이브 데이터가 삭제됩니다."}
        {typeof count === "number" && (
          <>
            {" "}지금 <b className="tabular-nums">{count.toLocaleString("ko-KR")}건</b>이 삭제돼요.
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
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
          {pending ? "삭제 중…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-full px-2 py-1.5 text-caption text-muted hover:text-fg"
        >
          취소
        </button>
      </div>
      {state.error && <span className="text-caption text-danger">{state.error}</span>}
      {state.ok && <span className="text-caption text-success">{okText}</span>}
    </form>
  );
}
