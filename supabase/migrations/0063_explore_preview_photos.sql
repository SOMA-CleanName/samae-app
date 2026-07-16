-- 0063 · 탐색 카테고리 미리보기 사진(홈 스트립)
--
-- /explore 홈에서 각 카테고리 가로 스트립에 보여줄 사진을 운영이 직접 고르고 순서 지정.
-- 비어 있으면 기존 로직(담긴 사진 position 순 앞 N장). 멤버 중에서 고르는 게 자연스럽다.
-- (배열 FK 미지원 — 읽는 쪽에서 정합성 검증. 기존 ordered_photo_ids 패턴)

alter table public.explore_categories
  add column if not exists preview_photo_ids uuid[] not null default '{}';
