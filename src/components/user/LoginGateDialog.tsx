"use client";

// 로그인 유도 다이얼로그 — 하려던 일을 그 자리에서 이어가게 한다.
//
// 로그인 페이지로 보내면 지금 보고 있던 사진도, 하려던 상담도 화면에서 사라진다.
// 사용자는 "왜 로그인해야 하는지" 를 다시 떠올려야 하고 그 지점에서 이탈한다.
//
// 문구는 최소로 둔다. 버튼 하나 누르면 끝나는 일에 설명을 쌓으면 오히려 큰일처럼 보인다 —
// 읽을거리가 늘어난 만큼 누르기까지의 시간도 늘어난다.

import { KakaoLoginButton } from "./KakaoLoginButton";
import { XIcon } from "./icons";

export function LoginGateDialog({
  title,
  description,
  next,
  context,
  onClose,
}: {
  title: string;
  /** 한 줄. 두 줄이 필요하면 문구가 아직 안 다듬어진 것이다 */
  description?: string;
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

        {description && (
          <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{description}</p>
        )}

        <div className="mt-4">
          <KakaoLoginButton next={next} context={context} />
        </div>

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
