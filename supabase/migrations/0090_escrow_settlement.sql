-- 에스크로 전환 — 고객이 사매 계좌로 입금, 운영자가 확인 후 수수료 차감·작가 송금.
-- bookings 에 정산(사매→작가 송금) 기록 필드 추가.
alter table public.bookings
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_amount_krw integer;
