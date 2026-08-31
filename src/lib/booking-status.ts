// 예약 상태 표기 — 서버 페이지와 채팅방(클라이언트)이 같은 규칙을 써야 해서
// server-only 가 붙지 않은 별도 파일에 둔다. 조회 로직은 bookings.ts 에 남는다.

export type BookingStatus =
  | "requested" | "accepted" | "paid" | "shot"
  | "delivered" | "completed" | "rejected" | "cancelled" | "refunded";

// 상태 한글 라벨 + 색조
/**
 * 보는 사람 기준 상태 문구.
 *
 * accepted 는 한 상태인데 두 사람에게 다른 의미다 — 고객이 [입금 완료]를 누른 순간
 * 고객에게는 끝난 거래(예약 확정)이고, 작가·운영에게는 아직 사매 확인이 남았다.
 * status 만 보고 라벨을 찍으면 고객 화면에 "입금 대기" 가 계속 남는다.
 */
export function bookingStatusLabel(
  b: { status: BookingStatus; transfer_marked_at?: string | null },
  amCustomer: boolean
): string {
  if (b.status === "accepted" && b.transfer_marked_at) {
    // 작가 쪽 문구는 주어를 밝힌다 — "입금 확인 중" 은 고객이 아직 안 낸 것처럼 읽힌다.
    // 실제로는 고객이 이미 보냈고, 사매가 통장을 확인하는 단계다.
    return amCustomer ? "예약 확정" : "사매 확인 중";
  }
  return STATUS_LABEL[b.status];
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "요청됨",
  accepted: "수락됨 · 입금 대기",
  paid: "입금 확인됨",
  shot: "촬영 완료",
  delivered: "보정본 전달됨",
  completed: "완료",
  rejected: "거절됨",
  cancelled: "취소됨",
  refunded: "환불됨",
};

export function statusTone(s: BookingStatus): string {
  if (s === "completed" || s === "paid") return "bg-emerald-500/15 text-emerald-700";
  if (s === "requested" || s === "accepted") return "bg-amber-500/15 text-amber-700";
  if (s === "rejected" || s === "cancelled" || s === "refunded") return "bg-brand/15 text-brand";
  return "bg-fg/10 text-fg/60";
}
