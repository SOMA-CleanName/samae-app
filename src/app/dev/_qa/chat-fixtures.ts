// 채팅 샌드박스의 가짜 방 — 협의 몇 마디 뒤에 예약서가 도착한 상태.
//
// 실제 흐름이 여기서 시작한다: 채팅으로 협의 → 작가가 예약서 제안 → **고객이 수락하는 순간**
// 결제 팝업(임박 동의 → 계좌 → 입금 완료)이 뜬다. 그 순간을 보려면 방 안에 있어야 한다.
//
// 날짜는 모듈 함수에서 만든다 — 컴포넌트 렌더 중 new Date() 는 react-hooks/purity 에 걸린다.

import type { BookingSnapshot, ChatMessage } from "@/lib/chat";
import { QA_AMOUNT, shootInDays, daysAgo } from "./fixtures";

export const QA_ME = "qa-customer";
export const QA_PHOTOGRAPHER = "qa-photographer";

/** 방을 채우는 협의 대화 — 예약서가 갑자기 튀어나오지 않게 */
export function qaMessages(booking: BookingSnapshot): ChatMessage[] {
  const t = (mins: number) => daysAgo(0, mins);
  const msg = (
    id: string,
    sender: string,
    body: string,
    mins: number,
    extra: Partial<ChatMessage> = {}
  ): ChatMessage => ({
    id,
    sender_id: sender,
    type: "text",
    body,
    image_path: null,
    created_at: t(mins),
    booking_id: null,
    ...extra,
  });

  return [
    msg("m1", QA_ME, "안녕하세요! 커플 스냅 문의드려요. 다음 주에 가능할까요?", 50),
    msg("m2", QA_PHOTOGRAPHER, "안녕하세요 :) 다음 주면 화·목 오후가 비어 있어요.", 46),
    msg("m3", QA_ME, "목요일 오후 2시로 할게요. 성수동 쪽에서 찍고 싶어요.", 42),
    msg("m4", QA_PHOTOGRAPHER, "좋아요. 2시간 촬영에 보정본 30장으로 예약서 보내드릴게요.", 38),
    msg("m5", QA_PHOTOGRAPHER, "", 35, {
      type: "system",
      body: "예약서를 보냈어요.",
      booking_id: booking.id,
      booking,
    }),
  ];
}

/**
 * 예약 스냅샷. `daysUntil` 로 임박 예약(3일)과 여유 예약(20일)을 가른다.
 * `status` 는 requested(수락 대기) 또는 accepted(수락 후) 를 쓴다.
 */
export function qaBooking(opts: {
  daysUntil: number;
  status: "requested" | "accepted";
  transferMarked?: boolean;
  lateConsented?: boolean;
}): BookingSnapshot {
  return {
    id: `qa-booking-${opts.daysUntil}-${opts.status}`,
    status: opts.status,
    shoot_at: shootInDays(opts.daysUntil),
    shoot_date: null,
    location_text: "서울 성동구 성수동",
    amount_krw: QA_AMOUNT,
    travel_fee_krw: 30_000,
    package_snapshot: { name: "커플 스냅 · 2시간", delivery_days: 21 },
    package_id: null,
    reschedule_proposed_at: null,
    reschedule_proposed_by: null,
    delivery_due_at: null,
    delivery_extension_proposed_to: null,
    delivered_at: null,
    memo: "야외 위주로 부탁드려요",
    custom_fields: null,
    transfer_marked_at: opts.transferMarked ? daysAgo(0) : null,
    late_booking_consent_at: opts.lateConsented ? daysAgo(0) : null,
    contact_sent_at: null,
    contact_delivered_at: null,
    contact_payload: null,
    proposed_by_photographer: true,
    settled_at: null,
    settlement_amount_krw: null,
    settlement_ack_at: null,
    settlement_dispute_at: null,
  };
}
