// 약관·정책 버전 — 예약을 확정할 때 어떤 규정이 적용됐는지 굳힌다.
//
// 취소환불정책 14조 2항, 수수료정책 2조 4항: "변경 전에 확정된 예약에는 확정 시점의 규정을 적용한다."
// 나중에 규정이 바뀌어도 지난 예약의 판정이 흔들리면 안 되므로, 입금 확인 시점에
// bookings.policy_snapshot 으로 남긴다 (fee_snapshot 과 같은 방식).
//
// 문안을 고치면 여기 버전도 올린다. 시행일은 실제 배포·공지 일정에 맞춘다.

export const TERMS_VERSION = "2026-09-10"; // 회원 이용약관 (src/app/(user)/terms/page.tsx EFFECTIVE_DATE 와 맞춘다)
export const REFUND_POLICY_VERSION = "1.0";
export const FEE_POLICY_VERSION = "1.0";
export const PHOTOGRAPHER_TERMS_VERSION = "1.0";
export const PHOTOGRAPHER_CONTRACT_VERSION = "2.0";

export type PolicySnapshot = {
  terms: string;
  refund: string;
  fee: string;
  /** 스냅샷을 찍은 시각 */
  at: string;
};

export function currentPolicySnapshot(now: Date = new Date()): PolicySnapshot {
  return {
    terms: TERMS_VERSION,
    refund: REFUND_POLICY_VERSION,
    fee: FEE_POLICY_VERSION,
    at: now.toISOString(),
  };
}
