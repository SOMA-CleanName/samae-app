// 사매 문의 — 환불·날짜 변경처럼 규정 판단이 필요한 요청.
//
// 종류·라벨은 서버와 클라이언트가 같이 쓰므로 server-only 를 붙이지 않는다.
// 정책 근거: 취소환불정책 1.0 (docs/35)

export type SupportKind = "refund" | "reschedule" | "other" | "photographer_cancel";

export const SUPPORT_KIND_LABEL: Record<SupportKind, string> = {
  refund: "취소 신청",
  reschedule: "날짜 변경 요청",
  other: "기타 문의",
  photographer_cancel: "촬영 취소 (작가)",
};

/** 문의 창에서 종류를 고를 때 함께 보여주는 안내 — 규정을 미리 알려 기대를 맞춘다 */
export const SUPPORT_KIND_HINT: Record<SupportKind, string> = {
  refund: "촬영 8일 전까지는 전액, 4~7일 전은 60%, 3일 전부터 촬영 당일까지는 10%가 환불됩니다. 신청한 시각 기준이에요.",
  reschedule: "예약 카드의 [일정 변경 요청]으로 작가님 동의를 받아 옮길 수 있어요.",
  other: "결제·정산·촬영 진행 중 궁금한 점을 적어주세요.",
  photographer_cancel:
    "작가 사정으로 취소하면 고객에게 전액 환불되고, 중개 수수료 상당액이 작가님께 청구돼요. 반복되면 이용이 제한될 수 있어요.",
};

/** 고객이 고르는 종류 */
export const SUPPORT_KINDS: SupportKind[] = ["refund", "other"]; // 날짜 변경은 채팅의 일정 변경 카드로 (취소환불 7조)
/** 작가가 고르는 종류 — 작가는 사매와 카톡으로 이어져 있어 창구를 넓히지 않는다. 취소만 여기로 (취소환불 8조) */
export const PHOTOGRAPHER_SUPPORT_KINDS: SupportKind[] = ["photographer_cancel"];

export function isSupportKind(v: unknown): v is SupportKind {
  return v === "refund" || v === "reschedule" || v === "other" || v === "photographer_cancel";
}
