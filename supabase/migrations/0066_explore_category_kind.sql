-- 0066 · 탐색 카테고리 종류(목적/무드) — 취향 테스트 v2
--
-- 취향 테스트를 '목적(무엇을 찍나)'과 '무드(어떤 분위기)' 두 축으로 나눈다.
-- 각 explore_categories 를 목적/무드/기타로 분류한다. (작가 mood_tags 대신 카테고리로 취향 판별)
--   purpose : 웨딩·커플·프로필·졸업 등 촬영 목적/상황
--   mood    : 빈티지·밝은·아련한·시네마틱·시크 등 분위기
--   other   : 장소/기타 (테스트에 안 씀)

alter table public.explore_categories
  add column if not exists kind text not null default 'other'
    check (kind in ('purpose', 'mood', 'other'));
