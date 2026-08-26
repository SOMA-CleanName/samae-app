-- 정산 수령 확인 루프 — 사매가 작가에게 정산금을 보낸 뒤(settled_at),
-- 작가가 [받았어요]로 확인(ack)하거나 [못 받았어요]로 확인 요청(dispute)한다.
alter table public.bookings
  add column if not exists settlement_ack_at timestamptz,
  add column if not exists settlement_dispute_at timestamptz;
