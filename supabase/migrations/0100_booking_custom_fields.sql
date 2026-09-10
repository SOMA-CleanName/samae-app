-- ════════════════════════════════════════════════════════════════
-- 0100 · 예약서 추가 입력 항목 (2026-08-28)
--
--   작가마다 촬영 전에 꼭 받아야 하는 정보가 다르다
--   (차량 이동 필요 여부 · 반려동물 동반 · 의상 벌수 · 헤어메이크업 유무 …).
--   지금은 그걸 메모에 적어달라고 하거나 채팅으로 따로 물어야 한다.
--
--   photographers.booking_fields : 작가가 정의한 항목 스펙
--     [{ "id":"f1", "label":"차량 이동이 필요한가요?", "type":"select",
--        "options":["필요","불필요"], "required":true }]
--     type = text | select | checkbox
--
--   bookings.custom_fields : 그 예약에서 실제로 채워진 값 (라벨까지 스냅샷)
--     [{ "id":"f1", "label":"차량 이동이 필요한가요?", "value":"필요" }]
--     ⚠️ 라벨을 같이 굳히는 이유 — 작가가 나중에 항목을 바꿔도 지난 예약서는 그대로 읽혀야 한다.
-- ════════════════════════════════════════════════════════════════

alter table public.photographers
  add column if not exists booking_fields jsonb not null default '[]'::jsonb;

alter table public.bookings
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;

comment on column public.photographers.booking_fields is
  '작가가 정의한 예약서 추가 항목 스펙 (최대 5개). 검증은 앱(normalizeBookingFields)에서.';
comment on column public.bookings.custom_fields is
  '제안 시점에 채워진 추가 항목 값 — 라벨 스냅샷 포함.';
