"use client";

// 로그인 유도 다이얼로그 — 하려던 일을 그 자리에서 이어가게 한다.
//
// 로그인 페이지로 보내면 지금 보고 있던 사진도, 하려던 상담도 화면에서 사라진다.
// 사용자는 "왜 로그인해야 하는지" 를 다시 떠올려야 하고 그 지점에서 이탈한다.
// 그래서 맥락(무엇을 하려던 참인지)을 문장으로 붙들어둔 채 로그인만 받는다.

import { KakaoLoginButton } from "./KakaoLoginButton";
import { XIcon } from "./icons";

export function LoginGateDialog({
  title,
  description,
  bullets,
  next,
  context,
  onClose,
}: {
  title: string;
  description: string;
  /** 로그인 후 무엇이 일어나는지 — 망설임을 줄이는 건 약속이지 설명이 아니다 */
  bullets?: string[];
  next: string;
  context: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-title font-semibold text-fg">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{description}</p>

        {bullets && bullets.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3">
            {bullets.map((b) => (
              <li key={b} className="flex gap-1.5 text-caption leading-relaxed text-muted">
                <span aria-hidden className="text-brand">
                  ·
                </span>
                {b}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <KakaoLoginButton next={next} context={context} />
        </div>
        <p className="mt-2 text-center text-caption text-faint">
          가입돼 있지 않아도 이 버튼 하나로 시작돼요
        </p>

        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className="mt-3 block text-center text-caption text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
        >
          다른 방법으로 로그인
        </a>
      </div>
    </div>
  );
}
