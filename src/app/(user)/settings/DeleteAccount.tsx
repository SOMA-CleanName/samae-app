"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount } from "./actions";

// 회원 탈퇴 — 강한 확인 후 계정·관련 데이터 삭제 + 홈으로.
export function DeleteAccount() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (
      !confirm(
        "정말 탈퇴하시겠어요?\n계정과 대화·예약·찜·후기 등 모든 데이터가 삭제되며 되돌릴 수 없어요."
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteAccount();
        router.replace("/");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "탈퇴에 실패했어요.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-xl border border-brand/30 px-4 py-2.5 text-sm font-medium text-brand hover:bg-brand/[0.06] disabled:opacity-50"
      >
        {pending ? "처리 중…" : "회원 탈퇴"}
      </button>
      {error && <p className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}
