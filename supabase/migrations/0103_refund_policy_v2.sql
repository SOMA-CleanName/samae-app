-- 0103. 환불 정책 v2 — 법정 청약철회(결제 후 7일) 도입에 필요한 두 기록.
--
-- 근거: docs/32-refund-policy.md §1-1, §6-2, §6-7
--
-- 1) late_booking_consent_at
--    촬영일까지 7일이 안 남은 상태에서 하는 예약은 두 규정이 동시에 성립한다 —
--    "촬영 7일 이내는 위약금 100%"(사매 약정)와 "결제 후 7일은 100% 환불"(법정 청약철회).
--    법정 권리가 이기므로, 위약금을 주장하려면 전자상거래법 시행령 제21조의 세 요건 중
--    ③ '사전 별도 고지 + 서면 동의' 를 갖춰야 한다. 그 동의 시각이 이 컬럼이다.
--    ⚠ 이 값이 없는 임박 예약은 결제 후 7일 내 취소 시 **전액 환불**로 계산된다.
--
-- 2) refund_due_at
--    제18조 제2항 — 환급은 사유 확정일로부터 3영업일 이내. 초과하면 연 15% 지연이자가
--    법정 의무로 붙는다. 전 구간 수동 처리라 주말이 끼면 그냥 넘어간다.
--    기산 시각을 남겨 어드민이 초과 건을 눈에 띄게 볼 수 있어야 한다.

alter table public.bookings
  add column if not exists late_booking_consent_at timestamptz,
  add column if not exists refund_due_at           timestamptz;

comment on column public.bookings.late_booking_consent_at is
  '촬영 7일 이내 예약의 환불불가 별도 동의 시각. 없으면 위약금 100%를 주장할 수 없다. docs/32 §1-1';
comment on column public.bookings.refund_due_at is
  '환불 사유 확정 시각 — 3영업일 SLA 기산점. docs/32 §6-7';

create index if not exists idx_bookings_refund_due
  on public.bookings (refund_due_at)
  where refund_due_at is not null;
