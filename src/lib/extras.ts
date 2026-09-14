// 추가 결제 (booking_extras) — 타입과 조회. 순수 타입은 클라이언트도 쓴다 (server-only 아님).
//
// 정책(회원약관 8조, 정책팀 2026-09-14):
//   pre_shoot  촬영 전 추가금 → 입금 확인 때 예약 총액에 합산. 위약금·수수료는 예약 기준.
//   post_shoot 촬영 후 결과물 관련 추가금 → 전달 전 전액 환불, 전달 후 환불 없음. 수수료·정산은 이 행이 따로.

export type ExtraKind = "pre_shoot" | "post_shoot";
export type ExtraStatus = "requested" | "accepted" | "declined" | "paid" | "refunded" | "cancelled";

export type BookingExtra = {
  id: string;
  booking_id: string;
  title: string;
  amount_krw: number;
  kind: ExtraKind;
  status: ExtraStatus;
  transfer_marked_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  refunded_at: string | null;
  refund_krw: number | null;
  settled_at: string | null;
  settlement_amount_krw: number | null;
  created_at: string;
};

export const EXTRA_COLS =
  "id, booking_id, title, amount_krw, kind, status, transfer_marked_at, paid_at, delivered_at, refunded_at, refund_krw, settled_at, settlement_amount_krw, created_at";

/** extra_card 말풍선의 body — 요청 당시 내용을 굳혀 둔다. 상태는 booking_extras 행이 진실 */
export type ExtraCardBody = { extraId: string; title: string; amountKrw: number; kind: ExtraKind };

export function parseExtraCardBody(body: string): ExtraCardBody | null {
  try {
    const v = JSON.parse(body) as Partial<ExtraCardBody>;
    if (!v || typeof v.extraId !== "string") return null;
    return {
      extraId: v.extraId,
      title: typeof v.title === "string" ? v.title : "추가 작업",
      amountKrw: Number(v.amountKrw) || 0,
      kind: v.kind === "post_shoot" ? "post_shoot" : "pre_shoot",
    };
  } catch {
    return null;
  }
}

export const EXTRA_KIND_LABEL: Record<ExtraKind, string> = {
  pre_shoot: "촬영 전 추가",
  post_shoot: "촬영 후 결과물 추가",
};

export function extraStatusLabel(e: Pick<BookingExtra, "status" | "transfer_marked_at" | "delivered_at" | "settled_at">): string {
  switch (e.status) {
    case "requested":
      return "고객 답 대기";
    case "accepted":
      return e.transfer_marked_at ? "입금 확인 중" : "입금 대기";
    case "declined":
      return "거절됨";
    case "paid":
      return e.delivered_at ? "전달 완료" : "결제 완료";
    case "refunded":
      return "환불됨";
    default:
      return "취소됨";
  }
}
