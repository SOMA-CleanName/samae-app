-- ════════════════════════════════════════════════════════════════
-- 0086 · 캐스팅 STEP 2 를 "작가 고르기" → "사진 고르기" 로 전환
--
-- 왜 바꾸는가:
--   사람들은 작가 이름으로 취향을 판단하지 않는다. 사진을 보고 판단한다.
--   이름 목록에서 고르게 하면 "아무나 하나" 누르고 넘어가지만,
--   사진 그리드에서 고르게 하면 실제로 탐색 탭과 같은 경험을 하고 취향을 표현한다.
--
-- 부수 효과가 더 크다:
--   탈락 통지에 "고르셨던 이 사진" 을 그대로 보여주고 그 사진 상세로 보낼 수 있다.
--   작가 프로필 링크보다 전환이 강하다 — 이미 좋다고 표시한 바로 그 이미지이기 때문.
--
-- preferred_photographer_ids 는 그대로 둔다. 사진에서 유도해 채우며,
-- 작가 배정·슬롯 계산은 여전히 작가 단위로 해야 하기 때문이다.
--
-- 적용: 운영(prod)은 Supabase SQL Editor 또는 psql. 0084·0085 이후.
-- ════════════════════════════════════════════════════════════════

alter table public.casting_applications
  add column if not exists preferred_photo_ids uuid[] not null default '{}';

comment on column public.casting_applications.preferred_photo_ids is
  '신청자가 고른 사진 1~3장. preferred_photographer_ids 는 여기서 유도된다. 탈락 통지의 전환 링크 소스.';

-- 사진 1~3장 필수. 기존 작가 제약(1~3명)은 유지 — 같은 작가 사진을 여러 장 고르면
-- 작가는 1명이 되므로 두 제약이 충돌하지 않는다.
alter table public.casting_applications
  drop constraint if exists casting_app_photo_pick;
alter table public.casting_applications
  add constraint casting_app_photo_pick
  check (cardinality(preferred_photo_ids) between 1 and 3);
