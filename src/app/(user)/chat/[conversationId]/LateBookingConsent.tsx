"use client";

// 임박 예약 환불불가 동의 — 촬영일까지 7일이 안 남은 건에만 뜬다 (docs/32 §6-2).
//
// 이 모달이 없으면 사매는 이 구간에서 위약금을 주장할 수 없다. 전자상거래법 시행령
// 제21조가 요구하는 건 '별도 화면 + 별도 체크'이고, 상세페이지 하단 문구로는 인정되지 않는다.
// 그래서 결제 안내로 넘어가기 전에 이 창을 먼저 세우고, 동의 없이는 진행시키지 않는다.
//
// 문구가 무섭게 읽히는 건 의도한 것이다. 여기서 물러서는 고객은 결제 후 분쟁이 될 고객이다.

import { useState } from "react";
import { agreeLateBooking } from "@/app/actions/payments";
import { CalendarIcon } from "@/components/user/icons";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

export function LateBookingConsent({
  bookingId,
  shootAt,
  onAgreed,
  onCancel,
}: {
  bookingId: string;
  shootAt: string | null;
  /** 동의가 기록된 뒤 — 호출부가 결제 안내로 넘어간다 */
  onAgreed: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const when = shootAt ? dateFmt.format(new Date(shootAt)) : "예정된 촬영일";

  async function agree() {
    setSending(true);
    try {
      const fd = new FormData();
      fd.set("id", bookingId);
      await agreeLateBooking(fd);
      onAgreed();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      aria-label="촬영 임박 예약 안내"
    >
      <div className="max-h-[88svh] w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop">
        <p className="flex items-start gap-2 text-title font-semibold text-fg">
          <span aria-hidden className="text-warning">
            ⚠
          </span>
          촬영일까지 7일이 남지 않았습니다
        </p>

        <p className="mt-1.5 flex items-center gap-1.5 text-body-sm font-medium text-fg">
          <CalendarIcon className="h-4 w-4 shrink-0 text-faint" />
          {when}
        </p>

        <p className="mt-3 text-body-sm leading-relaxed text-muted">
          이 예약은 작가가 해당 시간을 다른 촬영에 배정할 수 없도록 확보하는 개별 주문 건입니다.
          촬영 7일 이내 예약은 <b className="text-fg">취소하시더라도 환불되지 않습니다.</b>
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-warning-soft p-3.5 ring-1 ring-warning/25">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-caption font-medium leading-relaxed text-fg">
            위 내용을 확인했으며, 환불이 불가능한 예약임에 동의합니다.
          </span>
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 cursor-pointer rounded-full border border-line-strong py-3 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]"
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={agree}
            disabled={!checked || sending}
            className="flex-1 cursor-pointer rounded-full bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? "처리 중…" : "동의하고 결제"}
          </button>
        </div>
      </div>
    </div>
  );
}
