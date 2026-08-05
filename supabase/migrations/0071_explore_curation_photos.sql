-- 0071 · 무드별 '오늘의 큐레이션' 3컷 지정
--
-- 탐색탭 상단 캐러셀은 슬라이드 1개 = 무드 1개(3컷) 구조다.
-- 그 3컷을 운영자가 직접 고를 수 있게 한다. 미지정이면 타일 대표 사진 → 담긴 순으로 자동 채움.
-- (categories.curation_photo_ids 는 타겟 단위였던 이전 구조의 잔재 — 읽는 곳 없음)

alter table public.explore_categories
  add column if not exists curation_photo_ids uuid[] not null default '{}';

comment on column public.explore_categories.curation_photo_ids is
  '오늘의 큐레이션 캐러셀에 이 순서대로 노출할 사진 3장(운영자 지정). 비면 대표→담긴 순 자동.';
