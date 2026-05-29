-- ════════════════════════════════════════════════════════════════
-- 0005 · 예약 ↔ 가능시간 슬롯 연결
-- 예약이 어떤 가능시간 슬롯에 대한 것인지 기록 (수락 시 슬롯 예약 처리).
-- ════════════════════════════════════════════════════════════════

alter table public.bookings
  add column if not exists availability_id uuid
  references public.availability(id) on delete set null;

create index if not exists idx_bookings_availability on public.bookings (availability_id);
