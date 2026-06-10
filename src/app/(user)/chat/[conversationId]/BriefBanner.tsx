"use client";

import { useState } from "react";

// 상담 정보 미작성 고객용 인라인 배너 — 자동 모달 대신 부드럽게 권유. 닫기 가능.
export function BriefBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-fg/10 bg-fg/[0.03] px-4 py-3">
      <span className="text-lg">📋</span>
      <p className="min-w-0 flex-1 text-sm text-fg/70">
        상담 정보를 입력하면 작가가 촬영을 더 잘 준비할 수 있어요.
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("samae:open-brief"))}
        className="shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
      >
        작성
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="닫기"
        className="shrink-0 text-fg/35 hover:text-fg"
      >
        ✕
      </button>
    </div>
  );
}
