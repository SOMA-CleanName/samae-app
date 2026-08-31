// 환불 계산 — docs/32-refund-policy.md 의 규정을 그대로 옮긴 순수 함수.
//
// 돈이 갈라지는 자리라 화면·서버·어드민이 같은 답을 내야 한다. 조건문을 각자 짜면
// 반드시 어긋나고, 고객이 본 금액과 운영이 처리한 금액이 다르면 그 자체가 분쟁이 된다.
// 판정은 여기 한 곳에서만 한다. 부수효과 없음 — 테스트로 고정한다.
//
// ── 시계가 둘이다 ────────────────────────────────────────────────
//   결제일에서 출발하는 시계 : 법정 청약철회(전자상거래법 제17조) — 사매가 줄일 수 없다
//   촬영일로 다가오는 시계   : 취소 위약금 — 사매가 정하되 근거가 있어야 한다
// 둘이 겹치면 **법정 권리가 이긴다**(§1-1). 예외는 임박 예약에 별도 동의를 받아둔 경우뿐이다.
//
// 판정 순서가 곧 정책의 우선순위다:
//   1. 운영 판정(천재지변·작가 귀책)
//   2. 결제 후 7일 이내 → 100% 환불 (임박 예약 동의가 있으면 건너뛴다)
//   3. 촬영 7일 이내    → 위약금 100%
//   4. 그 외            → 위약금 50%

/** 촬영일 기준 — 이 안쪽이면 위약금 100% */
export const REFUND_WINDOW_DAYS = 7;
/** 결제일 기준 — 법정 청약철회 기간 */
export const WITHDRAWAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 운영이 내리는 판정 — 시간 규칙을 덮어쓴다 */
export type RefundOverride =
  /** 교통이 마비되는 수준의 천재지변 (양측 모두에 영향) — 누구의 잘못도 아니다 */
  | "force_majeure"
  /** 작가가 약속을 깼다 — 고객은 전액, 수수료는 작가가 문다 */
  | "photographer_fault";

export type RefundBasis =
  | "not_paid" // 아직 입금 전 — 환불이라는 개념이 없다
  | "withdrawal" // 결제 후 7일 이내 — 법정 청약철회
  | "penalty_50" // 촬영 7일 이전 · 청약철회 기간 경과
  | "contact_delivered" // 작가 연락처를 받아 중개가 끝났다
  | "penalty_100" // 촬영 임박 — 환불 없음
  | "force_majeure"
  | "photographer_fault";

export type RefundInput = {
  /** 촬영 시각. 없으면 shootDate(YYYY-MM-DD)로 그날 23:59(KST)를 쓴다 */
  shootAt: string | null;
  shootDate?: string | null;
  /** 고객이 [입금 완료]를 누른 시각 — 청약철회 기간의 기산점 */
  transferMarkedAt: string | null;
  /**
   * 임박 예약(촬영 7일 이내)의 환불불가 별도 동의 시각.
   * 이게 있어야만 촬영 임박 위약금이 청약철회를 이긴다 (시행령 제21조 ③요건).
   */
  lateBookingConsentAt?: string | null;
  /**
   * 고객이 작가 연락처를 받은 시각 (고지·동의 후).
   * 연락처가 넘어가면 사매의 중개 용역이 제공 완료되고 그 이후는 추적할 수 없다 —
   * 그래서 이 시점에 청약철회 100% 구간이 닫힌다 (제17조 제2항 제5호).
   */
  contactDeliveredAt?: string | null;
  /** 고객이 낸 총액 (촬영비 + 출장비) */
  amountKrw: number;
  /** 그 중 출장비 */
  travelFeeKrw: number;
  /** 이 예약에 부과된(또는 부과될) 사매 수수료 */
  feeKrw: number;
  /** 운영 판정 */
  override?: RefundOverride | null;
  /** 기준 시각 (테스트 주입용) */
  now?: Date;
};

export type RefundQuote = {
  basis: RefundBasis;
  /** 고객이 돌려받는 비율 — 0 | 50 | 100 */
  percent: number;
  /** 고객이 돌려받는 금액 */
  refundKrw: number;
  /** 사매 수수료를 면제하는가 */
  feeWaived: boolean;
  /** 사매가 최종적으로 갖는 수수료 */
  feeKrw: number;
  /** 작가 최종 수령액 — 음수면 작가가 그만큼 물어낸다 */
  photographerNetKrw: number;
  /** 화면에 그대로 띄울 한 줄 설명 */
  reason: string;
};

/** 촬영 시각 — 없으면 그날 23:59(KST). 경계는 늘 고객에게 유리하게 연다 */
function shootTime(input: RefundInput): number | null {
  if (input.shootAt) {
    const t = new Date(input.shootAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (input.shootDate) {
    const t = new Date(`${input.shootDate}T23:59:59+09:00`).getTime();
    if (!isNaN(t)) return t;
  }
  return null;
}

/** 청약철회 마감 — 결제 + 7일. 화면이 날짜로 보여줘야 해서 따로 뽑아 쓴다 (§6-1) */
export function withdrawalDeadline(transferMarkedAt: string | null): Date | null {
  if (!transferMarkedAt) return null;
  const t = new Date(transferMarkedAt).getTime();
  if (isNaN(t)) return null;
  return new Date(t + WITHDRAWAL_DAYS * DAY_MS);
}

/** 환불 마감 — 촬영 − 7일. 이 시각부터 위약금 100% */
export function penaltyStart(shootAt: string | null, shootDate?: string | null): Date | null {
  const t = shootTime({ shootAt, shootDate } as RefundInput);
  return t == null ? null : new Date(t - REFUND_WINDOW_DAYS * DAY_MS);
}

/** 이 예약이 '임박 예약'인가 — 결제 시점에 촬영까지 7일이 안 남았는가 (§6-2 모달 노출 조건) */
export function isLateBooking(
  shootAt: string | null,
  shootDate?: string | null,
  now: Date = new Date()
): boolean {
  const t = shootTime({ shootAt, shootDate } as RefundInput);
  return t != null && t - now.getTime() < REFUND_WINDOW_DAYS * DAY_MS;
}

export function refundQuote(input: RefundInput): RefundQuote {
  const now = (input.now ?? new Date()).getTime();
  const total = Math.max(0, Math.round(input.amountKrw || 0));
  const fee = Math.max(0, Math.round(input.feeKrw || 0));

  const settle = (
    basis: RefundBasis,
    percent: number,
    feeWaived: boolean,
    reason: string
  ): RefundQuote => {
    const refundKrw = Math.round((total * percent) / 100);
    const keptFee = feeWaived ? 0 : fee;
    return {
      basis,
      percent,
      refundKrw,
      feeWaived,
      feeKrw: keptFee,
      // 작가는 고객이 낸 돈에서 사매 수수료와 환불액을 뺀 만큼을 갖는다.
      // 전액 환불 + 수수료 유지면 음수 — 그게 작가 귀책의 부담이다.
      photographerNetKrw: total - keptFee - refundKrw,
      reason,
    };
  };

  // 입금 전이면 환불이 아니라 그냥 취소다
  if (!input.transferMarkedAt) {
    return settle("not_paid", 0, true, "입금 전이라 환불 없이 취소할 수 있어요.");
  }

  // 1) 운영 판정이 시간 규칙을 이긴다
  if (input.override === "photographer_fault") {
    return settle(
      "photographer_fault",
      100,
      false,
      "작가 사정으로 촬영이 무산됐어요. 전액 환불하고 수수료는 작가가 부담해요."
    );
  }
  if (input.override === "force_majeure") {
    return settle(
      "force_majeure",
      100,
      true,
      "천재지변으로 촬영이 불가능해요. 전액 환불하고 수수료도 면제해요."
    );
  }

  const shoot = shootTime(input);
  const shootImminent = shoot != null && shoot - now < REFUND_WINDOW_DAYS * DAY_MS;

  // 2) 법정 청약철회 — 결제 후 7일. 위약금·수수료를 한 푼도 뗄 수 없다.
  //
  //    촬영이 임박한 건이라도 원칙은 이쪽이다. 예외는 결제 전에 '환불 불가'를 별도 화면에서
  //    고지하고 동의를 받아둔 경우뿐이고(시행령 제21조 ③), 동의 기록이 없으면
  //    임박 예약이어도 전액 환불이다 — 기록이 없다는 건 요건을 못 갖췄다는 뜻이다.
  const paidAt = new Date(input.transferMarkedAt).getTime();
  const withinWithdrawal = !isNaN(paidAt) && now - paidAt <= WITHDRAWAL_DAYS * DAY_MS;
  const penaltyClaimable = shootImminent && !!input.lateBookingConsentAt;
  // 연락처를 받았으면 중개 용역이 끝난 것이다 — 기간이 남아 있어도 구간은 닫힌다
  const contactDelivered = !!input.contactDeliveredAt;

  if (withinWithdrawal && !penaltyClaimable && !contactDelivered) {
    return settle(
      "withdrawal",
      100,
      true,
      `결제 후 ${WITHDRAWAL_DAYS}일 이내라 전액 환불돼요.`
    );
  }

  // 3) 촬영 7일 이내 — 작가가 그 날짜를 비워둔 시점이라 위약금 100%
  //    (연락처를 받았더라도 이쪽이 먼저다 — 더 좁은 규정이 이긴다)
  if (shootImminent) {
    return settle(
      "penalty_100",
      0,
      false,
      `촬영 ${REFUND_WINDOW_DAYS}일 이내라 환불이 어려워요. 취소는 가능해요.`
    );
  }

  // 4) 연락처를 받아 100% 구간이 닫힌 경우 — 왜 50%인지는 화면이 그대로 말해줘야 한다.
  //    "50% 환불" 만 보면 고객은 이유를 모르고, 모르면 그게 곧 문의이고 분쟁이다.
  if (contactDelivered) {
    return settle(
      "contact_delivered",
      50,
      false,
      "작가 연락처를 받으신 뒤라 지불 금액의 50%가 환불됩니다."
    );
  }

  // 5) 그 외 — 청약철회 기간이 지났다
  return settle(
    "penalty_50",
    50,
    false,
    `결제 후 ${WITHDRAWAL_DAYS}일이 지나 지불 금액의 50%가 환불됩니다.`
  );
}

/** 환불 후 작가에게 실제로 송금할 금액 (음수면 작가가 사매에 반환할 금액) */
export function settlementAfterRefund(q: RefundQuote): number {
  return q.photographerNetKrw;
}

/** 환급 기한 — 사유 확정일로부터 3영업일 (전자상거래법 제18조 제2항).
 *  주말이 끼면 달력 3일로는 그냥 넘어간다. 초과하면 연 15% 지연이자가 법정 의무다.
 *  (공휴일은 세지 않는다 — 목록을 들고 있어야 해서, 그만큼 보수적으로 짧게 잡힌다) */
export const REFUND_SLA_BUSINESS_DAYS = 3;

export function refundSlaDueAt(refundDueAt: string | null): Date | null {
  if (!refundDueAt) return null;
  const d = new Date(refundDueAt);
  if (isNaN(d.getTime())) return null;
  let left = REFUND_SLA_BUSINESS_DAYS;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** 기한을 넘겼는가 — 어드민 목록에서 강조할 건 */
export function refundSlaOverdue(refundDueAt: string | null, now: Date = new Date()): boolean {
  const due = refundSlaDueAt(refundDueAt);
  return !!due && now.getTime() > due.getTime();
}
