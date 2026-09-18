// 약관·정책 버전 — 예약을 확정할 때 어떤 규정이 적용됐는지 굳힌다.
//
// 취소환불정책 15조 4항, 작가약관 12조 4항: "변경 전에 확정된 예약에는 확정 시점의 규정을 적용한다."
// 나중에 규정이 바뀌어도 지난 예약의 판정이 흔들리면 안 되므로, 입금 확인 시점에
// bookings.policy_snapshot 으로 남긴다 (fee_snapshot 과 같은 방식).
//
// 문안을 고치면 여기 버전도 올린다. 시행일은 실제 배포·공지 일정에 맞춘다.

/*
  2026-09-15 문서 묶음 — **네 문서를 한 번에 새로 썼고, 번호를 전부 1.0 으로 맞췄다.**

  전에는 문서마다 번호가 따로 굴러서(회원약관은 날짜꼴 "2026-09-10", 작가약관 2.0,
  수수료정책 1.1, 입점계약 1.1) 같은 날 시행되는 묶음인데 어느 판본끼리 짝인지가 안 보였다.
  이번 묶음은 서로를 조 단위로 인용하기 때문에(작가약관 ↔ 취소환불정책 ↔ 입점 동의서)
  판본이 엇갈리면 인용이 곧바로 빗나간다. 그래서 묶음 전체를 1.0 에서 다시 시작한다.

  ⚠️ **번호가 되돌아간다**(작가약관 2.0 → 1.0, 수수료정책 1.1 → 폐지). 기존 동의 기록은
     어느 칸을 봐도 현재 버전과 달라지므로 회원·작가 **전원이 재동의 대상**이 된다.
     이번 묶음은 문안이 전면 재작성이라 그게 맞는 결과다.

  ⚠️ **수수료·정산 정책은 폐지됐다.** 별도 문서였던 내용이 작가 이용약관 제12조~제16조와
     입점 동의서 제3항으로 들어갔다. `/terms/fees` 는 작가 이용약관으로 넘긴다.
*/

/** 회원 이용약관 (src/app/(user)/terms/page.tsx EFFECTIVE_DATE 와 맞춘다) */
export const TERMS_VERSION = "1.0";
/**
 * 취소환불정책·회원약관·작가약관·입점동의서의 시행일 — 네 문서가 같은 날 시행된다.
 *
 * ⚠️ 비워 두면 각 페이지가 "게시 공지 후 확정" 으로 보여준다. 지면에 적힌 시행일이 곧 약속이다.
 */
export const POLICY_EFFECTIVE_DATE = "2026-09-15";
export const REFUND_POLICY_VERSION = "1.0";
export const PHOTOGRAPHER_TERMS_VERSION = "1.0";
/** 작가 입점 동의서 — 읽고 동의하는 문서이자 동의 화면(AgreeGate)이 받는 항목의 정본 */
export const PHOTOGRAPHER_CONTRACT_VERSION = "1.0";

export type PolicySnapshot = {
  terms: string;
  refund: string;
  /**
   * 수수료 정책 버전 — 문서는 폐지됐고 수수료 조항은 작가 이용약관 제12조~제16조로 옮겨갔다.
   * 지난 예약의 스냅샷을 읽을 때 칸이 비면 안 되므로 작가약관 버전을 그대로 넣는다.
   */
  fee: string;
  /** 스냅샷을 찍은 시각 */
  at: string;
};

export function currentPolicySnapshot(now: Date = new Date()): PolicySnapshot {
  return {
    terms: TERMS_VERSION,
    refund: REFUND_POLICY_VERSION,
    fee: PHOTOGRAPHER_TERMS_VERSION,
    at: now.toISOString(),
  };
}

// ── 작가 입점 동의 묶음 ─────────────────────────────────────────
// consent.ts 에 있던 걸 여기로 옮겼다. 거기는 "server-only" 라 **클라이언트 컴포넌트가
// 가져다 쓸 수 없다** — AgreeGate 를 그대로 쓰는 /dev/flow 샌드박스가 막혔다.
// 값과 비교 규칙일 뿐 서버 자원을 안 쓰므로 여기가 맞는 자리다.

/**
 * 작가가 동의해야 하는 문서 묶음의 현재 버전.
 *
 * ⚠️ 2026-09-15 묶음에서 `fee` 칸이 빠졌다(수수료·정산 정책 폐지). 옛 기록에는 그 칸이
 *    남아 있지만 비교하지 않는다 — 어차피 나머지 셋이 전부 달라져 재동의 대상이다.
 */
export const PHOTOGRAPHER_AGREEMENT_VERSIONS = {
  terms: PHOTOGRAPHER_TERMS_VERSION,
  refund: REFUND_POLICY_VERSION,
  contract: PHOTOGRAPHER_CONTRACT_VERSION,
} as const;

export type AgreementVersions = { terms: string; refund: string; contract: string };

/** 최신 입점 동의가 현재 버전과 같은가 — 셋 중 하나라도 다르면 다시 받는다 */
export function agreementIsCurrent(versions: unknown): boolean {
  if (!versions || typeof versions !== "object") return false;
  const v = versions as Partial<AgreementVersions>;
  return (
    v.terms === PHOTOGRAPHER_AGREEMENT_VERSIONS.terms &&
    v.refund === PHOTOGRAPHER_AGREEMENT_VERSIONS.refund &&
    v.contract === PHOTOGRAPHER_AGREEMENT_VERSIONS.contract
  );
}
