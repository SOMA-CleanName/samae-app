-- 0039 · 소프트딜리트 아카이브
-- 어드민 초기화 등 삭제 시, 원본 행을 jsonb 로 보관 후 라이브 테이블에서 제거(복구 가능).
create table if not exists public.deleted_records (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   text,
  data        jsonb not null,
  deleted_by  uuid references public.profiles(id) on delete set null,
  deleted_at  timestamptz not null default now()
);

create index if not exists idx_deleted_records_table on public.deleted_records (table_name, deleted_at desc);

alter table public.deleted_records enable row level security;
drop policy if exists deleted_records_admin on public.deleted_records;
create policy deleted_records_admin on public.deleted_records
  for all using (public.is_admin()) with check (public.is_admin());
