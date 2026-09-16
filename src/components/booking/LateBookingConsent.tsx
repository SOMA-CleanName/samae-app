"use client";

// 임박 예약 위약금 동의 — 결제 시점에 촬영까지 7일 이하인 건에만 뜬다.
//
// 취소환불정책 3조 2항: 촬영까지 7일 이하면 청약철회가 제한되고 위약금 구간(40% 또는 90%)이
// 적용된다. 결제 직후라도 그렇다. 다만 전자상거래법 시행령 21조가 요구하는 '별도 화면 + 별도 체크'
// 동의가 없으면 그 제한을 주장할 수 없어(docs/32 1-1), 결제 안내로 넘어가기 전에 이 창을 먼저
// 세우고 동의 없이는 진행시키지 않는다. 동의 시각은 bookings.late_booking_consent_at 에 남는다.
//
// 문구는 실제 구간의 숫자로 말한다. "환불 불가" 라고 뭉뚱그리면 40% 구간에서 거짓말이 된다.

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

const fmt = new Intl.NumberFormat("ko-KR");

export function LateBookingConsent({
  bookingId,
  shootAt,
  amountKrw,
  penaltyPct,
  onAgreed,
  onCancel,
  agreeAction = agreeLateBooking,
}: {
  bookingId: string;
  shootAt: string | null;
  amountKrw: number;
  /** 지금 취소하면 적용되는 위약금 비율 — 40 또는 90 */
  penaltyPct: number;
  /** 동의가 기록된 뒤 — 호출부가 결제 안내로 넘어간다 */
  onAgreed: () => void;
  onCancel: () => void;
  /** 동의를 기록하는 액션. 기본은 진짜 서버 액션이고, 샌드박스만 갈아 끼운다 */
  agreeAction?: (formData: FormData) => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const when = shootAt ? dateFmt.format(new Date(shootAt)) : "예정된 촬영일";
  const refund = Math.round((amountKrw * (100 - penaltyPct)) / 100);

  async function agree() {
    setSending(true);
    try {
      const fd = new FormData();
      fd.set("id", bookingId);
      await agreeAction(fd);
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
          촬영까지 7일 이하로 남은 예약은 결제 후 7일 이내여도 청약철회가 제한되고, 입금 후 취소하시면{" "}
          <b className="text-fg">
            지불 금액의 {penaltyPct}%가 위약금으로 빠져 ₩{fmt.format(refund)}이 환불됩니다.
          </b>
          {penaltyPct < 90 && " 촬영 3일 전부터는 위약금이 90%가 됩니다."}
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-warning-soft p-3.5 ring-1 ring-warning/25">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-caption font-medium leading-relaxed text-fg">
            위 내용을 확인했으며, 결제 직후 취소해도 위약금 {penaltyPct}%가 적용되는 예약임에 동의합니다.
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
