"use client";

// 승인 안내 대본 복사 — 승인 직후 디스코드에도 올라가지만(ops-alert), 나중에 다시
// 보낼 일이 생긴다. 어드민 화면에서도 한 번에 집을 수 있어야 한다.

import { useState } from "react";

export function CopyApprovalScript({ script }: { script: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(script);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          // 클립보드 권한이 없을 수 있다(비 HTTPS·구형 브라우저). 그때는 직접 긁게 둔다
          window.prompt("복사해서 보내주세요", script);
        }
      }}
      className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
    >
      {done ? "복사됨 ✓" : "안내 대본 복사"}
    </button>
  );
}
