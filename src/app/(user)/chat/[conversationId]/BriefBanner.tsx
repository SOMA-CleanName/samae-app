"use client";

import { useState } from "react";
import { ClipboardIcon, XIcon } from "@/components/user/icons";

// 상담 정보 미작성 고객용 인라인 배너 — 자동 모달 대신 부드럽게 권유. 닫기 가능.
export function BriefBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <ClipboardIcon className="h-5 w-5 shrink-0 text-muted" />
      <p className="min-w-0 flex-1 text-body-sm text-muted">
        상담 정보를 입력하면 작가가 촬영을 더 잘 준비할 수 있어요.
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("samae:open-brief"))}
        className="shrink-0 cursor-pointer rounded-full bg-fg px-3.5 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90"
      >
        작성
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="닫기"
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-fg/[0.06] hover:text-fg"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
