-- 카테고리 '첫 진입 시 보여줄 사진'의 수동 순서(고정 순서).
-- 앞에서부터 이 순서대로 카테고리 피드 상단에 노출한다. 비어 있으면 기존 로직(셔플).
alter table public.categories
  add column if not exists ordered_photo_ids uuid[] not null default '{}';
