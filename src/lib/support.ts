// 사매 문의 — 환불·날짜 변경처럼 규정 판단이 필요한 요청.
//
// 종류·라벨은 서버와 클라이언트가 같이 쓰므로 server-only 를 붙이지 않는다.
// 정책 근거: 취소환불정책 1.0 (docs/35)

export type SupportKind = "refund" | "reschedule" | "other";

export const SUPPORT_KIND_LABEL: Record<SupportKind, string> = {
  refund: "취소 신청",
  reschedule: "날짜 변경 요청",
  other: "기타 문의",
};

/** 문의 창에서 종류를 고를 때 함께 보여주는 안내 — 규정을 미리 알려 기대를 맞춘다 */
export const SUPPORT_KIND_HINT: Record<SupportKind, string> = {
  refund: "촬영 8일 전까지는 전액, 4~7일 전은 60%, 3일 전부터 촬영 당일까지는 10%가 환불됩니다. 신청한 시각 기준이에요.",
  reschedule: "작가님이 동의하면 남은 기간과 관계없이 위약금 없이 옮길 수 있어요.",
  other: "결제·정산·촬영 진행 중 궁금한 점을 적어주세요.",
};

export const SUPPORT_KINDS: SupportKind[] = ["refund", "reschedule", "other"];

export function isSupportKind(v: unknown): v is SupportKind {
  return v === "refund" || v === "reschedule" || v === "other";
}
