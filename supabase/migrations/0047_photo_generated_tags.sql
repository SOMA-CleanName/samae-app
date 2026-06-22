-- ─────────────────────────────────────────────
-- 0047. 사진 검색 보강 태그
--
-- mood_tags 는 작가가 직접 입력한 공개 태그로 유지한다.
-- generated_tags 는 주간 배치/AI/CSV 작업으로 만든 검색 보강 태그이며,
-- 사람이 CSV에서 직접 수정할 수 있는 최종 생성 태그로 사용한다.
-- tag_generated_at 이 null 인 공개 사진만 다음 태그 배치 대상으로 export 한다.
-- ─────────────────────────────────────────────
alter table public.photos
  add column if not exists generated_tags text[] not null default '{}',
  add column if not exists tag_generated_at timestamptz,
  add column if not exists tag_reviewed boolean not null default false;

create index if not exists idx_photos_generated_tags
  on public.photos using gin (generated_tags);

create index if not exists idx_photos_tag_generation_pending
  on public.photos (created_at)
  where visibility = 'published' and tag_generated_at is null;
