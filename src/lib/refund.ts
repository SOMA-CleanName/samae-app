// 환불 계산 — 취소환불정책 1.0 을 그대로 옮긴 순수 함수.
//
// 돈이 갈라지는 자리라 화면·서버·어드민이 같은 답을 내야 한다. 판정은 여기 한 곳에서만
// 한다. 부수효과 없음 — refund.test.ts 로 경계를 고정한다.
//
// ── 규칙 (취소환불정책 4조·5조) ─────────────────────────────────────
//   남은 기간은 촬영 예정일의 '날짜' 기준이다. 시각이 아니라 달력 날짜로 센다.
//   예) 촬영일 9/20 → 9/12 까지 취소 = 8일 이상, 9/13~9/16 = 4~7일, 9/17~당일 = 3일 이내
//
//   | 취소 시점             | 위약금 | 환불 |
//   | 촬영 8일 이상 전      |   0%  | 100% |
//   | 촬영 4~7일 전         |  40%  |  60% |
//   | 3일 전 ~ 촬영 당일    |  90%  |  10% |
//   | 무단 노쇼(운영 판정)  | 100%  |   0% |
//
//   취소 시점 = 고객이 취소 신청을 낸 시각(5조 3항). 어드민이 판정하는 시각이 아니다.
//
// ── 청약철회 (3조) ────────────────────────────────────────────────
//   대금 지급 7일 이내면 청약철회(100%). 다만 그 시점에 촬영까지 7일 이하이면 제한된다.
//   8일 이상 구간은 어차피 0% 라 돈이 갈리지 않는다 — 청약철회는 라벨로만 남는다.
//   촬영이 임박한 채로 결제한 예약은 결제 전 별도 동의(late_booking_consent_at)가 있어야
//   결제 직후라도 위약금을 적용한다. 동의 기록이 없으면 청약철회로 100% 환불한다
//   (전자상거래법 시행령 21조 — 별도 고지·동의 없이는 제한을 주장할 수 없다).
//
// ── 위약금의 배분 (취소환불정책 14조 · 작가약관 16조) ──────────────────
//   위약금은 작가 수익으로 보아 수수료율로 나눈다.
//
//   ⚠️ **부가세도 뺀다.** 작가약관 16조 1항이 "촬영 대금과 **동일하게** 중개 수수료를 공제한
//      금액" 이라 하고, 12조 1항이 "부가가치세는 별도" 라 한다. 촬영비 정산은 수수료+부가세를
//      빼는데(payments.ts feeWithVat) 위약금만 부가세를 안 빼고 있었다 — 그만큼 사매가
//      부가세를 자기 돈으로 낸 셈이다(2026-09-18 점검).
//      예) 위약금 68,000 · 20% → 수수료 13,600 + 부가세 1,360 → 작가 53,040
//
//   위약금이 생기는 취소에는 정상 수수료가 따로 붙지 않는다 — 배분이 그 자리를 대신한다.
//   위약금이 없는 취소(0%·청약철회·불가항력)에는 누구에게도 수수료를 부과하지 않는다.
//   작가 사정 취소는 고객 100% 환불 + 수수료 상당액을 작가에게 청구한다(8조).

/** 위약금 구간 경계 — 촬영일까지 남은 달력일 기준 */
export const PENALTY_BANDS: ReadonlyArray<{ minDays: number; penaltyPct: number }> = [
  { minDays: 8, penaltyPct: 0 },
  { minDays: 4, penaltyPct: 40 },
  { minDays: 0, penaltyPct: 90 },
];

/** 촬영일까지 이 날수 이하면 청약철회가 제한된다 (3조 2항) */
export const WITHDRAWAL_RESTRICTED_DAYS = 7;
/** 결제일 기준 — 법정 청약철회 기간 */
export const WITHDRAWAL_DAYS = 7;
/**
 * @deprecated 옛 규정(촬영 7일 이내 100% 위약금)의 경계. 남은 소비처가 정리되면 지운다.
 * 새 규정에서는 PENALTY_BANDS 를 쓴다.
 */
export const REFUND_WINDOW_DAYS = 7;

/** 위약금을 작가와 사매가 나누는 기본 비율 — 수수료율과 연동된다 */
export const DEFAULT_PENALTY_COMPANY_RATE = DEFAULT_FEE_RATE;

import { addBusinessDays } from "./business-days";
import { DEFAULT_FEE_RATE, vatOnFee } from "./platform-fee";

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 운영이 내리는 판정 — 시간 규칙을 덮어쓴다 */
export type RefundOverride =
  /** 교통이 마비되는 수준의 천재지변 (양측 모두에 영향) — 전액 환불, 수수료 없음 */
  | "force_majeure"
  /** 작가 사정으로 촬영 무산 — 전액 환불, 수수료 상당액을 작가에게 청구 */
  | "photographer_fault"
  /** 작가가 촬영 시각 이후까지 나타나지 않음 — photographer_fault 와 같은 처리, 이력용 구분 */
  | "photographer_no_show"
  /** 고객이 취소 통보 없이 촬영에 불참 — 위약금 100% */
  | "customer_no_show"
  /** 촬영이 일부 이행된 뒤의 취소 등 — 운영이 환불액을 직접 정한다 (10조 4항) */
  | "partial";

export type RefundBasis =
  | "not_paid" // 입금 전 — 환불이 아니라 취소
  | "withdrawal" // 결제 후 7일 이내 청약철회 (돈은 penalty_0 과 같다)
  | "penalty_0" // 촬영 8일 이상 전
  | "penalty_40" // 촬영 4~7일 전
  | "penalty_90" // 3일 전 ~ 당일
  | "after_shoot" // 촬영 시각이 지남 — 환불 없음 (노쇼 판정은 운영이 별도로)
  | "customer_no_show"
  | "force_majeure"
  | "photographer_fault"
  | "photographer_no_show"
  | "partial";

export type RefundInput = {
  /** 촬영 시각. 없으면 shootDate(YYYY-MM-DD)로 그날 23:59(KST)를 쓴다 */
  shootAt: string | null;
  shootDate?: string | null;
  /** 고객이 [입금 완료]를 누른 시각 — 청약철회 기간의 기산점 */
  transferMarkedAt: string | null;
  /** 임박 예약(결제 시 촬영 7일 이하)의 위약금 별도 동의 시각 */
  lateBookingConsentAt?: string | null;
  /** 고객이 낸 총액 (촬영비 + 출장비 + 추가금) */
  amountKrw: number;
  /** 그 중 출장비 (화면 표기용 — 위약금은 총액 기준이라 계산에는 쓰지 않는다) */
  travelFeeKrw: number;
  /** 이 예약에 부과된(또는 부과될) 사매 수수료 — 작가 귀책 시 청구액 */
  feeKrw: number;
  /** 위약금 중 사매 몫 비율 — 예약의 수수료율. 없으면 전역 기본 요율(DEFAULT_FEE_RATE) */
  feeRate?: number | null;
  /** 운영 판정 */
  override?: RefundOverride | null;
  /** override === "partial" 일 때 운영이 정한 환불액 */
  manualRefundKrw?: number | null;
  /**
   * 취소 시점 — 고객이 취소 신청을 낸 시각. 이 값으로 남은 날수를 센다.
   * 없으면 now 를 쓴다(결제 전 미리보기·연락처 카드 등 '지금 취소하면' 용도).
   */
  requestedAt?: string | null;
  /** 기준 시각 (테스트 주입용) */
  now?: Date;
};

export type RefundQuote = {
  basis: RefundBasis;
  /** 고객이 돌려받는 비율 — 0 | 10 | 60 | 100 (partial 은 임의) */
  percent: number;
  /** 고객이 돌려받는 금액 */
  refundKrw: number;
  /** 위약금 비율 */
  penaltyPct: number;
  /** 위약금 총액 */
  penaltyKrw: number;
  /** 위약금 중 작가 몫 — 수수료와 그 부가세를 뺀 나머지 */
  penaltyPhotographerKrw: number;
  /** 위약금 중 사매 몫 — 중개 수수료 (부가세 별도) */
  penaltyCompanyKrw: number;
  /** 위약금 사매 몫에 붙는 부가세 — 사매가 받아 납부한다 */
  penaltyVatKrw: number;
  /** 작가 귀책 시 작가에게 청구하는 수수료 상당액 */
  feeClaimKrw: number;
  /** 촬영일까지 남은 달력일. 촬영 시각이 없으면 null */
  daysUntilShoot: number | null;
  /**
   * 사매 수수료를 면제하는가.
   * 위약금 구간에서는 정상 수수료 대신 위약금 배분이 들어가므로 true 이고,
   * 사매가 갖는 돈은 penaltyCompanyKrw 다.
   */
  feeWaived: boolean;
  /** 사매가 최종적으로 갖는 금액 — 정상 수수료 또는 위약금 사매 몫 또는 작가 청구액 */
  feeKrw: number;
  /** 작가 최종 수령액 — 음수면 작가가 그만큼 물어낸다 */
  photographerNetKrw: number;
  /** 화면에 그대로 띄울 한 줄 설명 */
  reason: string;
};

/** 옛 규정의 basis 값도 화면에서 읽히게 라벨을 남긴다 (refund_reason 컬럼에 남아 있다) */
export const REFUND_BASIS_LABEL: Record<string, string> = {
  not_paid: "입금 전 취소",
  withdrawal: "청약철회 (결제 7일 이내)",
  penalty_0: "촬영 8일 이상 전 (위약금 없음)",
  penalty_40: "촬영 4~7일 전 (위약금 40%)",
  penalty_90: "촬영 3일 전~당일 (위약금 90%)",
  after_shoot: "촬영 후",
  customer_no_show: "고객 노쇼",
  force_majeure: "불가항력",
  photographer_fault: "작가 사정",
  photographer_no_show: "작가 노쇼",
  partial: "부분 이행 (운영 판정)",
  // 2026-09 이전 규정
  penalty_50: "옛 규정 · 위약금 50%",
  contact_delivered: "옛 규정 · 연락처 수령 후 50%",
  penalty_100: "옛 규정 · 촬영 7일 이내",
};

export function refundBasisLabel(basis: string | null | undefined): string {
  if (!basis) return "";
  return REFUND_BASIS_LABEL[basis] ?? basis;
}

/** 촬영 시각 — 없으면 그날 23:59(KST) */
function shootTime(shootAt: string | null, shootDate?: string | null): number | null {
  if (shootAt) {
    const t = new Date(shootAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (shootDate) {
    const t = new Date(`${shootDate}T23:59:59+09:00`).getTime();
    if (!isNaN(t)) return t;
  }
  return null;
}

/** 어떤 시각이 KST 기준으로 몇 번째 날인지 — 달력 날짜 차이를 내는 데 쓴다 */
function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

/** KST 기준 그 날의 자정 (UTC ms) */
function kstDayStart(dayIndex: number): Date {
  return new Date(dayIndex * DAY_MS - KST_OFFSET_MS);
}

/**
 * 촬영일까지 남은 달력일 (KST). 촬영 당일이면 0, 지났으면 음수.
 * 정책 5조의 예시 그대로: 촬영 9/20 에 9/12 취소 → 8, 9/13 → 7, 9/17 → 3.
 */
export function daysUntilShoot(
  shootAt: string | null,
  shootDate: string | null | undefined,
  at: Date
): number | null {
  const shoot = shootTime(shootAt, shootDate);
  if (shoot == null) return null;
  return kstDayIndex(shoot) - kstDayIndex(at.getTime());
}

/** 남은 날수 → 위약금 비율 */
export function penaltyPctForDays(days: number): number {
  for (const band of PENALTY_BANDS) {
    if (days >= band.minDays) return band.penaltyPct;
  }
  // 촬영일이 지난 경우 — 호출부가 after_shoot 으로 따로 다룬다
  return 100;
}

/** 위약금 구간이 시작되는 날들 — 화면이 "9월 13일부터 40%" 처럼 날짜로 보여준다 */
export function penaltyStarts(
  shootAt: string | null,
  shootDate?: string | null
): { at40: Date; at90: Date } | null {
  const shoot = shootTime(shootAt, shootDate);
  if (shoot == null) return null;
  const shootDay = kstDayIndex(shoot);
  return {
    at40: kstDayStart(shootDay - 7), // 남은 날수가 7이 되는 날
    at90: kstDayStart(shootDay - 3), // 남은 날수가 3이 되는 날
  };
}

/**
 * @deprecated 옛 규정의 "환불 마감(촬영−7일)". 새 규정에서는 penaltyStarts() 를 쓴다.
 * 남은 소비처가 정리될 때까지 40% 구간 시작일을 돌려준다.
 */
export function penaltyStart(shootAt: string | null, shootDate?: string | null): Date | null {
  return penaltyStarts(shootAt, shootDate)?.at40 ?? null;
}

/** 청약철회 마감 — 결제 + 7일. 라벨용 (돈은 8일 이상 구간과 같다) */
export function withdrawalDeadline(transferMarkedAt: string | null): Date | null {
  if (!transferMarkedAt) return null;
  const t = new Date(transferMarkedAt).getTime();
  if (isNaN(t)) return null;
  return new Date(t + WITHDRAWAL_DAYS * DAY_MS);
}

/**
 * 이 예약이 '임박 예약'인가 — 지금 결제하면 촬영까지 7일 이하라 청약철회가 제한되는가.
 * 결제 전 별도 동의 모달의 노출 조건이다.
 */
export function isLateBooking(
  shootAt: string | null,
  shootDate?: string | null,
  now: Date = new Date()
): boolean {
  const days = daysUntilShoot(shootAt, shootDate, now);
  return days != null && days <= WITHDRAWAL_RESTRICTED_DAYS;
}

/** 임박 예약을 지금 취소하면 몇 % 위약금인가 — 동의 모달 문구용 */
export function lateBookingPenaltyPct(
  shootAt: string | null,
  shootDate?: string | null,
  now: Date = new Date()
): number | null {
  const days = daysUntilShoot(shootAt, shootDate, now);
  if (days == null) return null;
  return days < 0 ? 100 : penaltyPctForDays(days);
}

export function refundQuote(input: RefundInput): RefundQuote {
  const now = input.now ?? new Date();
  const total = Math.max(0, Math.round(input.amountKrw || 0));
  const fee = Math.max(0, Math.round(input.feeKrw || 0));
  const companyRate =
    input.feeRate != null && input.feeRate > 0 && input.feeRate < 1
      ? input.feeRate
      : DEFAULT_PENALTY_COMPANY_RATE;

  // 취소 시점 — 신청 시각이 있으면 그것, 없으면 지금
  const requested = input.requestedAt ? new Date(input.requestedAt) : now;
  const at = isNaN(requested.getTime()) ? now : requested;
  const days = daysUntilShoot(input.shootAt, input.shootDate, at);

  const base = {
    penaltyPct: 0,
    penaltyKrw: 0,
    penaltyVatKrw: 0,
    penaltyPhotographerKrw: 0,
    penaltyCompanyKrw: 0,
    feeClaimKrw: 0,
    daysUntilShoot: days,
  };

  /** 위약금이 없는 전액 환불 — 누구에게도 수수료 없음 */
  const fullRefund = (basis: RefundBasis, reason: string): RefundQuote => ({
    ...base,
    basis,
    percent: 100,
    refundKrw: total,
    feeWaived: true,
    feeKrw: 0,
    photographerNetKrw: 0,
    reason,
  });

  /** 위약금 구간 — 위약금을 작가·사매가 나눈다. 정상 수수료는 붙지 않는다 */
  const withPenalty = (basis: RefundBasis, pct: number, reason: string): RefundQuote => {
    const penaltyKrw = Math.round((total * pct) / 100);
    const refundKrw = total - penaltyKrw;
    const penaltyCompanyKrw = Math.round(penaltyKrw * companyRate);
    // 촬영비 정산과 같은 셈 — 수수료를 빼고, 그 수수료의 부가세도 뺀다 (작가약관 16조 1항·12조 1항)
    const penaltyVatKrw = vatOnFee(penaltyCompanyKrw);
    const penaltyPhotographerKrw = penaltyKrw - penaltyCompanyKrw - penaltyVatKrw;
    return {
      ...base,
      basis,
      percent: 100 - pct,
      refundKrw,
      penaltyPct: pct,
      penaltyKrw,
      penaltyVatKrw,
      penaltyPhotographerKrw,
      penaltyCompanyKrw,
      feeWaived: true,
      feeKrw: penaltyCompanyKrw,
      photographerNetKrw: penaltyPhotographerKrw,
      reason,
    };
  };

  // 0) 입금 전이면 환불이 아니라 그냥 취소다
  if (!input.transferMarkedAt) {
    return {
      ...base,
      basis: "not_paid",
      percent: 0,
      refundKrw: 0,
      feeWaived: true,
      feeKrw: 0,
      photographerNetKrw: 0,
      reason: "입금 전이라 환불 없이 취소할 수 있어요.",
    };
  }

  // 1) 운영 판정이 시간 규칙을 이긴다
  switch (input.override) {
    case "force_majeure":
      return fullRefund("force_majeure", "천재지변으로 촬영이 불가능해요. 전액 환불하고 수수료도 없어요.");
    case "photographer_fault":
    case "photographer_no_show": {
      // 고객은 전액. 수수료 상당액은 작가에게 청구한다 (취소환불 8조 2항, 작가약관 18조 1항)
      //
      // ⚠️ 여기는 **부가세를 붙이지 않는다.** 정산에서 빼는 수수료는 용역 대가라 부가세가 붙지만,
      //    이건 작가 귀책에 따른 청구(손해배상 성격)라 과세 대상인지가 다른 문제다. 약관도
      //    "수수료 상당액" 이라고만 한다. 판단이 서면 그때 붙일 것 — 지금 임의로 붙이지 않는다.
      return {
        ...base,
        basis: input.override,
        percent: 100,
        refundKrw: total,
        feeClaimKrw: fee,
        feeWaived: false,
        feeKrw: fee,
        photographerNetKrw: -fee,
        reason:
          input.override === "photographer_no_show"
            ? "작가 노쇼예요. 전액 환불하고 수수료 상당액은 작가에게 청구해요."
            : "작가 사정으로 촬영이 무산됐어요. 전액 환불하고 수수료 상당액은 작가에게 청구해요.",
      };
    }
    case "customer_no_show":
      return withPenalty("customer_no_show", 100, "취소 통보 없이 촬영에 불참한 건이라 환불되지 않아요.");
    case "partial": {
      const refundKrw = Math.min(total, Math.max(0, Math.round(input.manualRefundKrw ?? 0)));
      const penaltyKrw = total - refundKrw;
      const penaltyCompanyKrw = Math.round(penaltyKrw * companyRate);
      return {
        ...base,
        basis: "partial",
        percent: total > 0 ? Math.round((refundKrw / total) * 100) : 0,
        refundKrw,
        penaltyPct: total > 0 ? Math.round((penaltyKrw / total) * 100) : 0,
        penaltyKrw,
        penaltyCompanyKrw,
        penaltyVatKrw: vatOnFee(penaltyCompanyKrw),
        penaltyPhotographerKrw: penaltyKrw - penaltyCompanyKrw - vatOnFee(penaltyCompanyKrw),
        feeWaived: true,
        feeKrw: penaltyCompanyKrw,
        photographerNetKrw: penaltyKrw - penaltyCompanyKrw - vatOnFee(penaltyCompanyKrw),
        reason: "촬영이 일부 이행된 건이라 사매가 이행 정도를 보고 환불액을 정했어요.",
      };
    }
    default:
      break;
  }

  // 촬영 시각을 모르는 예약 — 남은 날수를 셀 수 없다. 고객에게 유리하게 전액으로 본다
  if (days == null) {
    return fullRefund("penalty_0", "촬영일이 정해지지 않아 전액 환불돼요.");
  }

  // 2) 촬영이 지난 뒤 — 환불 없음 (10조 1항). 노쇼·작가 귀책은 운영 판정으로 온다
  if (days < 0) {
    return {
      ...base,
      basis: "after_shoot",
      percent: 0,
      refundKrw: 0,
      feeWaived: false,
      feeKrw: fee,
      // 실제 정산도 수수료+부가세를 뺀다(payments.ts feeWithVat) — 알림에 다른 숫자가 가면 안 된다
      photographerNetKrw: total - fee - vatOnFee(fee),
      reason: "촬영이 끝난 뒤라 환불되지 않아요.",
    };
  }

  // 3) 청약철회 — 결제 후 7일 이내. 촬영까지 8일 이상이면 무조건 100%,
  //    7일 이하면 '임박 예약 동의'가 있어야만 위약금을 적용한다.
  const paidAt = new Date(input.transferMarkedAt).getTime();
  const withinWithdrawal = !isNaN(paidAt) && at.getTime() - paidAt <= WITHDRAWAL_DAYS * DAY_MS;
  if (withinWithdrawal) {
    if (days > WITHDRAWAL_RESTRICTED_DAYS) {
      return fullRefund("withdrawal", `결제 후 ${WITHDRAWAL_DAYS}일 이내라 전액 환불돼요.`);
    }
    if (!input.lateBookingConsentAt) {
      return fullRefund(
        "withdrawal",
        `결제 후 ${WITHDRAWAL_DAYS}일 이내이고 별도 동의 기록이 없어 전액 환불돼요.`
      );
    }
    // 동의가 있으면 아래 구간 규칙으로 내려간다
  }

  // 4) 촬영일까지 남은 날수로 위약금 구간을 정한다
  const pct = penaltyPctForDays(days);
  if (pct === 0) {
    return fullRefund("penalty_0", "촬영 8일 이상 전이라 전액 환불돼요.");
  }
  if (pct === 40) {
    return withPenalty("penalty_40", 40, "촬영 4~7일 전이라 지불 금액의 60%가 환불돼요.");
  }
  return withPenalty("penalty_90", 90, "촬영 3일 전부터는 지불 금액의 10%만 환불돼요.");
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
  // 영업일 셈법은 정산(7영업일)과 같다 — lib/business-days 한 곳에서만 센다
  return addBusinessDays(d, REFUND_SLA_BUSINESS_DAYS);
}

/** 기한을 넘겼는가 — 어드민 목록에서 강조할 건 */
export function refundSlaOverdue(refundDueAt: string | null, now: Date = new Date()): boolean {
  const due = refundSlaDueAt(refundDueAt);
  return !!due && now.getTime() > due.getTime();
}

/** 폼에서 온 문자열이 운영 판정 값인지 */
export const REFUND_OVERRIDES: readonly RefundOverride[] = [
  "force_majeure",
  "photographer_fault",
  "photographer_no_show",
  "customer_no_show",
  "partial",
];

export function isRefundOverride(v: unknown): v is RefundOverride {
  return typeof v === "string" && (REFUND_OVERRIDES as readonly string[]).includes(v);
}
