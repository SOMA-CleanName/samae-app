// 약관·정책 버전 — 예약을 확정할 때 어떤 규정이 적용됐는지 굳힌다.
//
// 취소환불정책 14조 2항, 수수료정책 2조 4항: "변경 전에 확정된 예약에는 확정 시점의 규정을 적용한다."
// 나중에 규정이 바뀌어도 지난 예약의 판정이 흔들리면 안 되므로, 입금 확인 시점에
// bookings.policy_snapshot 으로 남긴다 (fee_snapshot 과 같은 방식).
//
// 문안을 고치면 여기 버전도 올린다. 시행일은 실제 배포·공지 일정에 맞춘다.

export const TERMS_VERSION = "2026-09-10"; // 회원 이용약관 (src/app/(user)/terms/page.tsx EFFECTIVE_DATE 와 맞춘다)
/**
 * 취소환불정책·수수료정산정책·작가약관·입점계약의 시행일.
 * ⚠️ 비워 두면 각 페이지가 "게시 공지 후 확정" 으로 보여준다. 배포일과 공지 기간(회원 유리 7일,
 *    작가 불리 30일)을 맞춘 날짜를 넣을 것. 지면에 적힌 시행일이 곧 약속이다.
 */
export const POLICY_EFFECTIVE_DATE = "";
export const REFUND_POLICY_VERSION = "1.0";
export const FEE_POLICY_VERSION = "1.0";
// ⚠️ 이 둘이 **서로 바뀌어 있었다**(작가약관 1.0 / 입점계약 2.0). 최종 문서 묶음의 번호는
//    작가 이용약관 2.0 · 작가 입점 동의서 1.0 이다. 입점 동의서가 "작가 이용약관(버전 2.0)에
//    동의한다" 고 적고 있어서, 뒤바뀐 채로 두면 동의 기록이 가리키는 문서가 어긋난다.
export const PHOTOGRAPHER_TERMS_VERSION = "2.0";
export const PHOTOGRAPHER_CONTRACT_VERSION = "1.0";

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

// ── 작가 입점 동의 묶음 ─────────────────────────────────────────
// consent.ts 에 있던 걸 여기로 옮겼다. 거기는 "server-only" 라 **클라이언트 컴포넌트가
// 가져다 쓸 수 없다** — AgreeGate 를 그대로 쓰는 /dev/flow 샌드박스가 막혔다.
// 값과 비교 규칙일 뿐 서버 자원을 안 쓰므로 여기가 맞는 자리다.

/** 작가가 동의해야 하는 문서 묶음의 현재 버전 */
export const PHOTOGRAPHER_AGREEMENT_VERSIONS = {
  terms: PHOTOGRAPHER_TERMS_VERSION,
  fee: FEE_POLICY_VERSION,
  refund: REFUND_POLICY_VERSION,
  contract: PHOTOGRAPHER_CONTRACT_VERSION,
} as const;

export type AgreementVersions = { terms: string; fee: string; refund: string; contract: string };

/** 최신 입점 동의가 현재 버전과 같은가 — 넷 중 하나라도 다르면 다시 받는다 */
export function agreementIsCurrent(versions: unknown): boolean {
  if (!versions || typeof versions !== "object") return false;
  const v = versions as Partial<AgreementVersions>;
  return (
    v.terms === PHOTOGRAPHER_AGREEMENT_VERSIONS.terms &&
    v.fee === PHOTOGRAPHER_AGREEMENT_VERSIONS.fee &&
    v.refund === PHOTOGRAPHER_AGREEMENT_VERSIONS.refund &&
    v.contract === PHOTOGRAPHER_AGREEMENT_VERSIONS.contract
  );
}
