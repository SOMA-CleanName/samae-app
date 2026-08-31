-- 예약 제안 날짜/시간 분리 — 시간은 미정이어도 날짜는 확정해 제안할 수 있게.
--   · shoot_at(시각 확정)과 별개로 희망 '날짜'를 보존한다.
--   · shoot_at이 있으면 그 날짜와 동일 값, 시간 미정이면 날짜만 채워진다.
alter table public.bookings
  add column if not exists shoot_date date;
