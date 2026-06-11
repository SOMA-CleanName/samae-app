-- ─────────────────────────────────────────────
-- 0020. 예약 제안 주체 기록 (작가도 제안 가능)
--
-- 기존엔 구매자만 제안 → 작가가 수락하는 단방향이었다.
-- 작가도 예약을 제안할 수 있게 되면서 '누가 수락하는가'가 제안자에 따라 달라진다:
--   · 구매자 제안  → 작가가 수락
--   · 작가 제안    → 구매자가 수락
-- proposed_by_photographer: true면 작가가 제안한 건(=구매자가 수락 주체).
-- 기존 행은 모두 구매자 제안이므로 default false 가 정확하다.
-- ─────────────────────────────────────────────
alter table public.bookings
  add column if not exists proposed_by_photographer boolean not null default false;
