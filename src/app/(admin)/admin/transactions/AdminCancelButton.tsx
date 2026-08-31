"use client";

// 운영 예약 취소 — 수락만 해놓고 입금이 오지 않는 건을 결국 누군가는 물러야 하는데,
// 당사자가 안 눌러주면 운영이 손쓸 방법이 없었다.
//
// 되돌릴 수 없는 조치라 한 번 더 묻고, 사유는 받아서 양측 알림·채팅에 그대로 남긴다.

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { cancelBooking } from "@/app/actions/bookings";

export function AdminCancelButton({ bookingId, label }: { bookingId: string; label: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-caption text-danger transition-colors hover:bg-danger/10"
      >
        취소
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
      onClick={() => setOpen(false)}
    >
      <form
        action={cancelBooking}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop"
      >
        <input type="hidden" name="id" value={bookingId} />
        <p className="text-body-sm font-semibold text-fg">예약을 취소할까요?</p>
        <p className="mt-1 text-caption text-muted">{label}</p>
        <p className="mt-2 text-caption text-danger">
          되돌릴 수 없어요. 고객·작가 양쪽에 알림이 가고 채팅에도 기록됩니다.
        </p>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-caption text-muted">사유 (양측에 그대로 보여요)</span>
          <input
            name="reason"
            required
            maxLength={200}
            placeholder="예: 수락 후 5일간 입금이 없어 취소합니다."
            className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 cursor-pointer rounded-lg px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:bg-fg/[0.06]"
          >
            그만두기
          </button>
          <ConfirmButton />
        </div>
      </form>
    </div>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 cursor-pointer rounded-lg bg-danger px-3 py-2 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "취소 중…" : "예약 취소"}
    </button>
  );
}
