// 채팅 샌드박스의 가짜 방 — 협의 몇 마디 뒤에 예약서가 도착한 상태.
//
// 실제 흐름이 여기서 시작한다: 채팅으로 협의 → 작가가 예약서 제안 → **고객이 수락하는 순간**
// 결제 팝업(임박 동의 → 계좌 → 입금 완료)이 뜬다. 입금이 확인된 뒤에는 연락처 전달과
// 일정 변경이 열린다. 그 순간들을 보려면 방 안에 있어야 한다.
//
// 날짜는 모듈 함수에서 만든다 — 컴포넌트 렌더 중 new Date() 는 react-hooks/purity 에 걸린다.

import type { BookingSnapshot, ChatMessage } from "@/lib/chat";
import { QA_AMOUNT, shootInDays, daysAgo } from "./fixtures";

export const QA_ME = "qa-customer";
export const QA_PHOTOGRAPHER = "qa-photographer";

/** 작가가 스튜디오 프로필에 등록해 둔 연락 수단 — 전달 카드가 이걸 편다 */
export const QA_CONTACTS = [
  { id: "c1", kind: "phone", value: "010-1234-5678" },
  { id: "c2", kind: "instagram", value: "kim_photo" },
];

export type QaStage = "late" | "normal" | "revisit" | "marked" | "paid" | "paid-early";

/**
 * 단계별 예약 스냅샷.
 *
 * `late`/`normal`  수락 대기 — 촬영까지 3일 / 20일
 * `revisit`        수락만 하고 나간 방 (입금 전)
 * `marked`         고객이 [입금 완료] 를 누름 — 사매 확인 대기
 * `paid`           사매가 입금을 확인함 · 촬영 5일 뒤 — 연락처가 열린 구간
 * `paid-early`     같은 상태인데 촬영 30일 뒤 — 연락처가 아직 닫힌 구간 (HANDOFF §3-1)
 */
export function qaBooking(stage: QaStage): BookingSnapshot {
  const paid = stage === "paid" || stage === "paid-early";
  // paid 는 촬영 5일 뒤 — 연락처 전달이 열리는 구간이어야 그 흐름을 볼 수 있다(HANDOFF §3-1)
  const daysUntil = stage === "normal" ? 20 : stage === "paid-early" ? 30 : paid ? 5 : 3;

  return {
    id: `qa-booking-${stage}`,
    status: paid ? "paid" : stage === "late" || stage === "normal" ? "requested" : "accepted",
    shoot_at: shootInDays(daysUntil),
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
    transfer_marked_at: stage === "marked" || paid ? daysAgo(0) : null,
    late_booking_consent_at: stage === "marked" ? daysAgo(0) : null,
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

/**
 * 방을 채우는 협의 대화 — 예약서가 갑자기 튀어나오지 않게.
 *
 * `cards` 는 액션이 만들어 낸 타임라인 카드다. 실제로는 서버가 메시지를 심는데,
 * 샌드박스에서는 스텁이 이 목록을 늘린다.
 */
export function qaMessages(
  booking: BookingSnapshot,
  cards: ("contact_card" | "reschedule_card")[] = []
): ChatMessage[] {
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

  const out: ChatMessage[] = [
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

  if (cards.includes("reschedule_card")) {
    out.push(
      msg("m6", QA_PHOTOGRAPHER, "촬영 일정 변경을 요청했어요.", 5, {
        type: "reschedule_card",
        booking_id: booking.id,
        booking,
      })
    );
  }
  if (cards.includes("contact_card")) {
    out.push(
      msg("m7", QA_PHOTOGRAPHER, "연락처를 보냈어요.", 2, {
        type: "contact_card",
        booking_id: booking.id,
        booking,
      })
    );
  }
  return out;
}
