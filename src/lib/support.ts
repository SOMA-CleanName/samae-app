// 사매 문의 — 환불·날짜 변경처럼 규정 판단이 필요한 요청.
//
// 종류·라벨은 서버와 클라이언트가 같이 쓰므로 server-only 를 붙이지 않는다.
// 정책 근거: docs/32-refund-policy.md

export type SupportKind = "refund" | "reschedule" | "other";

export const SUPPORT_KIND_LABEL: Record<SupportKind, string> = {
  refund: "환불 요청",
  reschedule: "날짜 변경 요청",
  other: "기타 문의",
};

/** 문의 창에서 종류를 고를 때 함께 보여주는 안내 — 규정을 미리 알려 기대를 맞춘다 */
export const SUPPORT_KIND_HINT: Record<SupportKind, string> = {
  refund: "결제 후 7일 이내면 전액, 촬영 7일 전까지는 50% 환불돼요.",
  reschedule: "촬영일까지 7일 이상 남았을 때 작가님과 협의해 옮길 수 있어요.",
  other: "결제·정산·촬영 진행 중 궁금한 점을 적어주세요.",
};

export const SUPPORT_KINDS: SupportKind[] = ["refund", "reschedule", "other"];

export function isSupportKind(v: unknown): v is SupportKind {
  return v === "refund" || v === "reschedule" || v === "other";
}
