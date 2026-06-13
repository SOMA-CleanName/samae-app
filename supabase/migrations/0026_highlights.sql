-- ════════════════════════════════════════════════════════════════
-- 0026 · 프로필 하이라이트 (인스타 하이라이트)
--   · highlights        : 작가별 큐레이션 묶음(제목·커버·순서)
--   · highlight_items   : 하이라이트 ↔ 기존 포트폴리오 사진(순서)
--   커버는 직접 업로드(cover_url) 또는 항목 사진(cover_photo_id) 중 택1, 둘 다 없으면 첫 항목.
--   재사용: photos(공개 URL), RLS 헬퍼 is_my_photographer/is_admin, set_updated_at 트리거.
-- ════════════════════════════════════════════════════════════════

create table public.highlights (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  title           text not null default '',
  cover_url       text,
  cover_photo_id  uuid references public.photos(id) on delete set null,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_highlights_photographer on public.highlights (photographer_id, sort_order);

create table public.highlight_items (
  id           uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  photo_id     uuid not null references public.photos(id) on delete cascade,
  sort_order   integer not null default 0,
  unique (highlight_id, photo_id)
);
create index idx_highlight_items_highlight on public.highlight_items (highlight_id, sort_order);

alter table public.highlights enable row level security;
alter table public.highlight_items enable row level security;

-- 조회: 소유 작가/운영자 + 공개 사진 항목이 1장 이상인 하이라이트는 누구나
create policy highlights_select on public.highlights for select using (
  public.is_my_photographer(photographer_id)
  or public.is_admin()
  or exists (
    select 1 from public.highlight_items hi
    join public.photos p on p.id = hi.photo_id
    where hi.highlight_id = highlights.id and p.visibility = 'published'
  )
);
create policy highlights_write on public.highlights for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

-- 항목 조회: 소유 작가/운영자 + 사진이 공개면 누구나
create policy highlight_items_select on public.highlight_items for select using (
  exists (
    select 1 from public.highlights h
    where h.id = highlight_id and (public.is_my_photographer(h.photographer_id) or public.is_admin())
  )
  or exists (select 1 from public.photos p where p.id = photo_id and p.visibility = 'published')
);
create policy highlight_items_write on public.highlight_items for all
  using (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id and (public.is_my_photographer(h.photographer_id) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id and (public.is_my_photographer(h.photographer_id) or public.is_admin())
    )
  );

create trigger trg_highlights_updated
  before update on public.highlights
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.highlights to anon, authenticated;
grant select, insert, update, delete on public.highlight_items to anon, authenticated;

-- 하이라이트 커버 이미지 버킷 (공개 읽기, 업로드는 service_role)
insert into storage.buckets (id, name, public)
values ('samae-highlight', 'samae-highlight', true)
on conflict (id) do nothing;

drop policy if exists "highlight public read" on storage.objects;
create policy "highlight public read"
  on storage.objects for select
  using (bucket_id = 'samae-highlight');
