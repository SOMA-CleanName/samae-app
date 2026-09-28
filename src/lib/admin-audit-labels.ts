// 운영자 행동 기록의 **말** — 액션 이름과 사람이 읽는 문장.
//
// 기록하는 쪽(admin-audit.ts)은 server-only 라 테스트에서 못 부른다. 그런데 정작
// 틀리기 쉬운 건 저장이 아니라 **이름**이다 — 액션 문자열을 오타로 넣으면 기록은
// 남는데 목록에서 "알 수 없는 동작" 으로 뜨고, 그걸 알아채는 건 한참 뒤다.
// 그래서 이름과 라벨만 여기로 떼어 테스트로 묶는다.

export const ADMIN_ACTIONS = {
  // 돈
  deposit_confirm: "입금 확인",
  settle: "정산 완료",
  refund: "환불 처리",
  refund_paid: "환불 송금 완료",
  extra_confirm: "추가결제 입금 확인",
  extra_refund: "추가결제 환불",
  extra_settle: "추가결제 정산",
  platform_account: "사매 입금 계좌 변경",
  // 계약·자격
  fee_change: "수수료 설정 변경",
  photographer_approve: "작가 승인",
  photographer_reject: "작가 반려",
  photographer_suspend: "작가 정지",
  photographer_remove: "작가 퇴출",
  photographer_removal_begin: "작가 퇴출 점검 시작(정지)",
  unagreed_visibility_sync: "계약 미동의 작가 노출 일괄 정리",
  application_approve: "작가 신청 승인",
  license_verify: "사업자등록증 검수",
  // 게시물
  review_hide: "후기 가림",
  review_show: "후기 다시 보임",
  // 계정
  user_role: "회원 역할 변경",
  user_ban: "회원 차단 변경",
} as const;

export type AdminActionKey = keyof typeof ADMIN_ACTIONS;

export function isAdminActionKey(v: unknown): v is AdminActionKey {
  return typeof v === "string" && v in ADMIN_ACTIONS;
}

/** 목록에 쓰는 이름. 모르는 값이어도 **감추지 않는다** — 원문을 보여줘야 추적이 된다. */
export function adminActionLabel(action: string): string {
  return isAdminActionKey(action) ? ADMIN_ACTIONS[action] : `알 수 없는 동작 (${action})`;
}

/**
 * 되돌릴 수 없는 액션 — 목록에서 눈에 띄어야 한다.
 *
 * 기준은 "실수했을 때 되돌리는 데 드는 비용" 이다. 정산·환불은 **돈이 이미 나갔고**,
 * 퇴출은 사진·대화·후기가 함께 사라진다. 승인·차단은 되돌리면 그만이라 뺀다.
 */
const HEAVY: ReadonlySet<string> = new Set([
  "settle",
  "refund",
  "refund_paid",
  "extra_refund",
  "extra_settle",
  "photographer_remove",
]);

export function isHeavyAction(action: string): boolean {
  return HEAVY.has(action);
}
