"use client";

import type { ReactNode } from "react";

/**
 * 로그인·가입이 같이 쓰는 조각들.
 * 두 지면이 버튼 모양·필드 높이가 조금씩 다르면 같은 서비스로 안 읽힌다.
 */

/** 카카오 — 색·심볼은 카카오 가이드 값이라 토큰으로 바꾸지 않는다. */
export function KakaoButton({
  onClick,
  label,
  track,
}: {
  onClick: () => void;
  label: string;
  track?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-track={track}
      className="auth-kakao flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 text-body-sm font-bold text-[#191600]"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
        <path d="M12 3.5C6.9 3.5 2.8 6.75 2.8 10.76c0 2.55 1.7 4.79 4.26 6.07l-1.08 4a.33.33 0 0 0 .5.36l4.72-3.12c.26.02.53.03.8.03 5.1 0 9.2-3.25 9.2-7.26S17.1 3.5 12 3.5Z" />
      </svg>
      {label}
    </button>
  );
}

/** 폼 필드 — 라벨을 띄우지 않고 placeholder 만 쓰던 걸 라벨로 올렸다(자동완성·접근성). */
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      <input
        {...props}
        className="auth-input w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none"
      />
    </label>
  );
}

/** 구분선 — "또는 이메일" */
export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** 잉크 버튼 — 폼 제출 */
export function SubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="auth-submit mt-1 w-full cursor-pointer rounded-xl bg-fg py-3.5 text-body-sm font-bold text-bg disabled:opacity-50"
    >
      {loading ? "처리 중…" : children}
    </button>
  );
}

/** 알림 줄 — 성공/오류를 같은 규격으로. */
export function Note({
  tone,
  children,
}: {
  tone: "ok" | "bad";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "bad" ? "alert" : undefined}
      className={`rounded-xl px-4 py-3 text-body-sm ${
        tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      {children}
    </p>
  );
}
