// 환불 계산 — docs/32-refund-policy.md 의 규정을 그대로 옮긴 순수 함수.
//
// 돈이 갈라지는 자리라 화면·서버·어드민이 같은 답을 내야 한다. 조건문을 각자 짜면
// 반드시 어긋나므로 판정은 여기 한 곳에서만 한다. 부수효과 없음 — 테스트로 고정한다.
//
// 판정 순서가 곧 정책의 우선순위다:
//   1. 운영 판정(천재지변·작가 귀책)이 있으면 그것이 모든 시간 규칙을 이긴다
//   2. 촬영 7일 이내면 환불 없음
//   3. 연락처를 교환했으면 50%
//   4. 결제 후 24시간 이내면 100%, 아니면 50%

export const REFUND_WINDOW_DAYS = 7;
export const COOLING_OFF_HOURS = 24;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** 운영이 내리는 판정 — 시간 규칙을 덮어쓴다 */
export type RefundOverride =
  /** 교통이 마비되는 수준의 천재지변 (양측 모두에 영향) — 누구의 잘못도 아니다 */
  | "force_majeure"
  /** 작가가 약속을 깼다 — 고객은 전액, 수수료는 작가가 문다 */
  | "photographer_fault";

export type RefundBasis =
  | "not_paid" // 아직 입금 전 — 환불이라는 개념이 없다
  | "cooling_off" // 결제 후 24시간 이내
  | "standard_50" // 7일 이상 남았고 24시간은 지났다
  | "contact_exchanged" // 연락처 교환 이후 — 24시간이어도 50%
  | "within_7_days" // 촬영 임박 — 환불 없음
  | "force_majeure"
  | "photographer_fault";

export type RefundInput = {
  /** 촬영 시각. 없으면 shootDate(YYYY-MM-DD)로 그날 23:59(KST)를 쓴다 */
  shootAt: string | null;
  shootDate?: string | null;
  /** 고객이 [입금 완료]를 누른 시각 — 24시간 창구의 기산점 */
  transferMarkedAt: string | null;
  /** 검열을 통과한 연락처가 처음 오간 시각 */
  contactExchangedAt?: string | null;
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
  /** 0 | 50 | 100 */
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

  // 2) 촬영 7일 이내 — 작가가 그 날짜를 비워둔 시점이라 환불이 없다
  const shoot = shootTime(input);
  if (shoot != null && shoot - now < REFUND_WINDOW_DAYS * DAY_MS) {
    return settle(
      "within_7_days",
      0,
      false,
      `촬영 ${REFUND_WINDOW_DAYS}일 이내라 환불이 어려워요. 취소는 가능해요.`
    );
  }

  // 3) 연락처 교환 이후 — 24시간 창구가 닫힌다
  if (input.contactExchangedAt) {
    return settle("contact_exchanged", 50, false, "연락처를 주고받은 뒤라 50% 환불이에요.");
  }

  // 4) 결제 후 24시간 — 아무도 손해 보지 않는 구간
  const paidAt = new Date(input.transferMarkedAt).getTime();
  if (!isNaN(paidAt) && now - paidAt <= COOLING_OFF_HOURS * HOUR_MS) {
    return settle(
      "cooling_off",
      100,
      true,
      `결제 후 ${COOLING_OFF_HOURS}시간 이내라 전액 환불돼요.`
    );
  }

  return settle("standard_50", 50, false, "촬영 7일 이전이라 50% 환불이에요.");
}

/** 환불 후 작가에게 실제로 송금할 금액 (음수면 작가가 사매에 반환할 금액) */
export function settlementAfterRefund(q: RefundQuote): number {
  return q.photographerNetKrw;
}
