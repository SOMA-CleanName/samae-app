"use client";

// 초상 사용 거부 스위치 — 예약 상세에서 **회원 본인**에게만 보인다.
//
// 작가약관 17조 4항이 약속한 "원하지 않는다는 의사를 밝힐" 자리다. 그 자리가 없어서
// 약관만 있고 행사 방법이 없는 상태였다(2026-09-17 점검).
//
// ⚠️ 기본값은 **사용 허용**이다. 촬영을 맡기는 것과 그 사진이 남의 포트폴리오에 걸리는
//    것은 다른 일이지만, 스냅 촬영의 관행이 포트폴리오 게재를 전제로 하고 작가가 그
//    전제로 가격을 정한다. 기본을 거부로 두면 작가 쪽 계약 조건이 조용히 바뀐다.
//    대신 **언제든, 촬영이 끝난 뒤에도** 끌 수 있게 한다.

import { useState, useTransition } from "react";
import { setPortraitOptout } from "@/app/actions/portrait-optout";

export function PortraitOptout({
  bookingId,
  initialOptedOut,
}: {
  bookingId: string;
  initialOptedOut: boolean;
}) {
  // 서버 왕복을 기다리는 동안 스위치가 굳어 있으면 안 눌린 것처럼 보인다 — 먼저 움직이고
  // 실패하면 되돌린다
  const [optedOut, setOptedOut] = useState(initialOptedOut);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    const prev = optedOut;
    setOptedOut(next);
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("bookingId", bookingId);
      if (next) fd.set("optout", "on");
      try {
        await setPortraitOptout(fd);
      } catch (e) {
        setOptedOut(prev);
        setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해주세요.");
      }
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-fg/10 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">내 사진을 포트폴리오에 쓰지 않기</p>
          <p className="mt-1.5 text-xs leading-relaxed text-faint">
            끄시면 이 촬영의 결과물을 작가님이 포트폴리오에 올리거나 사매 홍보에 쓸 수 없어요.
            촬영이 끝난 뒤에도 언제든 바꾸실 수 있고, 바꾸시면 작가님께 바로 알려드려요.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={optedOut}
          aria-label="내 사진을 포트폴리오에 쓰지 않기"
          disabled={pending}
          onClick={() => toggle(!optedOut)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-60 ${
            optedOut ? "bg-fg" : "bg-fg/20"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg shadow transition-transform ${
              optedOut ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {optedOut && (
        <p className="mt-3 rounded-lg bg-fg/[0.04] px-3 py-2 text-xs leading-relaxed text-muted">
          작가님께 알려드렸어요. 이미 올라간 사진이 있으면 내려달라고 요청하실 수 있고, 처리되지
          않으면 사매에 알려주세요.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </section>
  );
}
