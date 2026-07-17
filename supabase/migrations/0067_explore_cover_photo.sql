-- 0067 · 탐색 카테고리 대표 사진 — 취향 테스트 무드 스와이프용
--
-- 무드 카테고리(kind=mood)마다 '대표 사진 1장'을 지정한다. 취향 테스트 2단계에서
-- 이 대표 사진들을 하나씩 스와이프해 좋아요한 무드가 사용자의 취향이 된다.
-- (사진 삭제 시 set null — 읽는 쪽에서 대표 없으면 덱에서 제외)

alter table public.explore_categories
  add column if not exists cover_photo_id uuid references public.photos(id) on delete set null;
