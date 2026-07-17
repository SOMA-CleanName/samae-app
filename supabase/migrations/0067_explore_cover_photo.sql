-- 0067 · 탐색 무드 카테고리 목적별 대표 사진 — 취향 테스트 무드 스와이프용
--
-- 무드 카테고리(kind=mood)마다 '목적별 대표 사진'을 지정한다.
-- 목적(웨딩/커플/개인)에 따라 스와이프 카드 사진이 달라지도록: cover_by_purpose 는
-- { "wedding": <photoId>, "couple": <photoId>, "personal": <photoId> } 형태 맵.
-- (사진 삭제 시 정합성은 읽는 쪽에서 검증 — jsonb 라 FK 없음)

alter table public.explore_categories
  add column if not exists cover_by_purpose jsonb not null default '{}'::jsonb;
