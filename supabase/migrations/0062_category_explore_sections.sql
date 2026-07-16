-- 0062 · 광고 카테고리별 탐색 탭 노출 섹션
--
-- /c/<slug> 광고로 진입한 사람(samae_cat 쿠키)의 /explore 탭에 보여줄
-- 탐색 카테고리(explore_categories)를 광고별로 지정 + 순서 배치한다.
-- 지정하면 그 카테고리만(순서대로), 비어 있으면 기본(전체 공개 sort 순).
-- (배열 FK 는 PG 미지원 — 정합성은 읽는 쪽에서 검증. 기존 ordered_photo_ids 와 동일 패턴)

alter table public.categories
  add column if not exists explore_section_ids uuid[] not null default '{}';
