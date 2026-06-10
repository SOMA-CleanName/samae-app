-- ════════════════════════════════════════════════════════════════
-- 0011 · 채팅 내 예약 제안 (예약 템플릿 + 출장비)
--
-- 배경(2026-06-04 결정): 예약/문의를 하나의 진입으로 통합한다. 버튼을 누르면
-- 채팅이 열리고, 채팅 헤더의 "예약하기"로 작가가 미리 설정한 템플릿을 작성해
-- "제안"하면 채팅에 예약 카드가 뜨고, 작가가 "수락"하면 체결(accepted)된다.
--
--   - photographers.booking_note    : 작가가 쓴 예약 안내문/조건
--   - photographers.travel_fee_krw  : 출장비 옵션 금액 (0=출장 옵션 없음)
--   - bookings.travel_fee_krw       : 제안 당시 적용된 출장비 스냅샷
--   - messages.booking_id           : 예약 제안 카드로 렌더할 메시지 (type='system')
-- ════════════════════════════════════════════════════════════════

alter table public.photographers
  add column if not exists booking_note   text,
  add column if not exists travel_fee_krw integer not null default 0;

alter table public.bookings
  add column if not exists travel_fee_krw integer not null default 0;

alter table public.messages
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;
