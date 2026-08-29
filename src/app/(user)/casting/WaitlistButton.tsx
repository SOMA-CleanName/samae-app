"use client";

import { useState, useTransition } from "react";
import { joinCastingWaitlist } from "./actions";

// 마감 중 유입을 버리지 않는 장치 — 다음 회차 알림 대기열 등록.
export function WaitlistButton({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="text-sm font-medium text-success">
        신청됐어요. 다음 회차가 열리면 알려드릴게요.
      </p>
    );
  }

  if (!isLoggedIn) {
    return (
      <a
        href="/login?next=/casting"
        className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        다음 회차 알림 받기
      </a>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinCastingWaitlist();
            if (r.ok) setDone(true);
            else setError(r.error ?? "잠시 후 다시 시도해주세요.");
          })
        }
        className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "신청 중…" : "다음 회차 알림 받기"}
      </button>
      {error && <p className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}
