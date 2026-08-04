-- ════════════════════════════════════════════════════════════════
-- 0068 · 작가 소개(무드) 페이지 — 섹션 기반 커스텀 페이지 (2026-08-04)
--   · about_sections : 작가가 조합하는 소개 섹션(타입·내용 jsonb·순서)
--   섹션 타입(v1): heading / text_columns / quote / image_full / image_pair / image_text
--   content jsonb 안에 텍스트·이미지({url, thumbUrl, width, height})를 담는다.
--   → 추후 자유 배치(v2)는 content 에 좌표 필드만 추가해 확장 (스키마 변경 없음).
--   재사용: RLS 헬퍼 is_my_photographer/is_admin, set_updated_at 트리거.
-- ════════════════════════════════════════════════════════════════

create table public.about_sections (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  type            text not null check (type in ('heading', 'text_columns', 'quote', 'image_full', 'image_pair', 'image_text')),
  content         jsonb not null default '{}'::jsonb,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_about_sections_photographer on public.about_sections (photographer_id, sort_order);

alter table public.about_sections enable row level security;

-- 조회: 소유 작가/운영자 + 승인된 작가의 섹션은 누구나
create policy about_sections_select on public.about_sections for select using (
  public.is_my_photographer(photographer_id)
  or public.is_admin()
  or exists (
    select 1 from public.photographers p
    where p.id = photographer_id and p.status = 'approved'
  )
);
create policy about_sections_write on public.about_sections for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

create trigger trg_about_sections_updated
  before update on public.about_sections
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.about_sections to anon, authenticated;

-- 소개 페이지 이미지 버킷 (공개 읽기, 업로드는 service_role)
insert into storage.buckets (id, name, public)
values ('samae-about', 'samae-about', true)
on conflict (id) do nothing;

drop policy if exists "about public read" on storage.objects;
create policy "about public read"
  on storage.objects for select
  using (bucket_id = 'samae-about');
