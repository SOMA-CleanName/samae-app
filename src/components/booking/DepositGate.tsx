"use client";

// 예약 상세의 입금 구간 — 계좌 · 고지 · 동의 · [입금 완료] 를 한 덩어리로 묶는다.
//
// 왜 컴포넌트로 묶었나. 전에는 이 자리가 계좌 박스와 `markTransferSent` 폼뿐이었다.
// 같은 결제를 채팅(`AcceptPayDialog`)에서 하면 임박 예약 동의와 위약금 표를 거치는데,
// 여기서는 **아무것도 없이 바로 입금 완료**를 누를 수 있었다. 알림 링크가 전부
// `/bookings/[id]` 라 오히려 이쪽이 자주 지나가는 길이다.
//
// 그 구멍의 대가가 크다. 동의 기록(`late_booking_consent_at`)이 없으면 `refundQuote()` 가
// 결제 7일 이내 취소를 **전액 환불**로 판정한다(전자상거래법 시행령 21조 — 별도 고지·동의
// 없이는 제한을 주장할 수 없다). 촬영 3일 전 30만원 예약이면 위약금 27만원이 통째로 사라진다.
//
// ⚠️ 임박 예약은 **계좌를 가린다.** 동의는 돈이 나가기 전에 받아야 의미가 있는데,
//    계좌번호가 먼저 보이면 손님은 동의 화면을 거치지 않고 송금해 버린다. 그러면
//    "고지받고 보냈다" 가 성립하지 않는다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markTransferSent } from "@/app/actions/payments";
import { isLateBooking, lateBookingPenaltyPct } from "@/lib/refund";
import { PolicyNote } from "./PolicyNote";
import { LateBookingConsent } from "./LateBookingConsent";

const fmt = new Intl.NumberFormat("ko-KR");

export type DepositAccount = { bank: string; number: string; holder: string };

export function DepositGate({
  bookingId,
  amountKrw,
  shootAt = null,
  shootDate = null,
  lateBookingConsentAt = null,
  transferMarkedAt = null,
  account,
}: {
  bookingId: string;
  amountKrw: number;
  shootAt?: string | null;
  shootDate?: string | null;
  /** 이미 받아둔 동의 — 있으면 다시 묻지 않는다 */
  lateBookingConsentAt?: string | null;
  /** 이미 입금 완료를 눌렀으면 결과만 보여준다 */
  transferMarkedAt?: string | null;
  /** 서버가 확인한 사매 계좌. 준비 전이면 null */
  account: DepositAccount | null;
}) {
  const router = useRouter();
  // 가장 불리한 조항을 직접 읽고 체크해야 열린다 (약관규제법 3조 — 설명하지 않은 조항은
  // 계약 내용으로 주장할 수 없다). "정책에 동의합니다" 한 줄로는 그 의무를 채우지 못한다.
  const [agreed, setAgreed] = useState(false);
  const [consented, setConsented] = useState(!!lateBookingConsentAt);
  const [askConsent, setAskConsent] = useState(false);
  const [sending, startSend] = useTransition();

  const lateBooking = isLateBooking(shootAt, shootDate);
  const latePct = lateBooking ? (lateBookingPenaltyPct(shootAt, shootDate) ?? 90) : null;
  const lateConsented = consented && lateBooking && latePct != null;
  const locked = lateBooking && !consented;

  function markPaid() {
    const fd = new FormData();
    fd.set("id", bookingId);
    startSend(async () => {
      await markTransferSent(fd);
      router.refresh();
    });
  }

  if (transferMarkedAt) {
    return (
      <p className="mt-3 rounded-full bg-success-soft px-3 py-2 text-center text-xs text-success-ink">
        ✅ 입금 완료를 알렸어요 · 사매가 확인하면 예약이 확정돼요
      </p>
    );
  }

  return (
    <>
      {askConsent && (
        <LateBookingConsent
          bookingId={bookingId}
          shootAt={shootAt}
          amountKrw={amountKrw}
          penaltyPct={latePct ?? 90}
          onAgreed={() => {
            setConsented(true);
            setAskConsent(false);
          }}
          onCancel={() => setAskConsent(false)}
        />
      )}

      {locked ? (
        // 계좌 자리를 잠금 안내가 대신한다 — 번호가 보이면 동의 전에 송금해 버린다
        <div className="mt-3 rounded-xl bg-warning-soft p-3.5 ring-1 ring-warning/25">
          <p className="text-sm font-semibold text-warning-ink">
            촬영일까지 7일이 남지 않은 예약이에요
          </p>
          <p className="mt-1 text-xs leading-relaxed text-warning-ink/85">
            입금 후 취소하면 위약금 {latePct}%가 적용돼요. 내용을 확인하고 동의하시면 입금 계좌를
            보여드릴게요.
          </p>
          <button
            type="button"
            onClick={() => setAskConsent(true)}
            className="mt-3 w-full cursor-pointer rounded-xl bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            안내 확인하기
          </button>
        </div>
      ) : account ? (
        <div className="mt-3 rounded-xl bg-fg/[0.04] p-3 text-sm">
          <Row label="은행" value={account.bank} />
          <Row label="계좌번호" value={account.number} />
          <Row label="예금주" value={account.holder} />
          <div className="mt-2 flex items-center justify-between border-t border-fg/10 pt-2">
            <span className="text-muted">보낼 금액</span>
            <span className="text-base font-bold">₩{fmt.format(amountKrw)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-ink">
          입금 계좌 안내를 준비 중이에요. 잠시 후 다시 확인해주세요.
        </p>
      )}

      {/* 무엇에 동의하고 보내는지 — 입금 버튼 바로 위가 유일하게 읽히는 자리다 */}
      {!locked && (
        <>
          <PolicyNote
            shootAt={shootAt}
            shootDate={shootDate}
            amountKrw={amountKrw}
            lateBookingPct={lateConsented ? latePct : null}
          />

          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface-2 p-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="text-caption font-medium leading-relaxed text-fg">
              {lateConsented
                ? `입금 후 취소하면 위약금 ${latePct}%가 빠진다는 점을 확인했습니다.`
                : "촬영 4~7일 전 취소는 위약금 40%, 3일 전부터 촬영 당일까지는 위약금 90%가 빠진다는 점을 확인했습니다."}
            </span>
          </label>

          <button
            type="button"
            onClick={markPaid}
            disabled={sending || !account || !agreed}
            className="mt-3 w-full cursor-pointer rounded-xl bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "처리 중…" : "입금 완료"}
          </button>
        </>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
