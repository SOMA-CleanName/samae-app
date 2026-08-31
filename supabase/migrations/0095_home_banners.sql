-- ════════════════════════════════════════════════════════════════
-- 0095 · 홈 상단 배너 — 어드민이 관리하는 이미지 캐러셀 (2026-08-27)
--   · home_banners : 이미지 + 링크 + 공개/순서 + 노출 기간
--   홈(/) 과 카테고리(/c/[slug]) 상단에서 공용으로 슬라이드된다.
--   이미지는 samae-banner 버킷(공개 읽기), 업로드는 service_role 라우트가 담당.
--   재사용: RLS 헬퍼 is_admin, set_updated_at 트리거.
-- ════════════════════════════════════════════════════════════════

create table public.home_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',        -- 대체텍스트 겸 운영자 식별용
  image_url   text not null,
  thumb_url   text,
  width       integer,
  height      integer,
  link_url    text,                            -- 클릭 시 이동(내부 경로 또는 https). 비우면 클릭 없음
  published   boolean not null default false,
  sort_order  integer not null default 0,
  starts_at   timestamptz,                     -- null = 즉시 시작
  ends_at     timestamptz,                     -- null = 무기한
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_home_banners_live on public.home_banners (published, sort_order);

alter table public.home_banners enable row level security;

-- 조회: 공개 + 노출기간 안이면 누구나 / 운영자는 전부
create policy home_banners_select on public.home_banners for select using (
  (published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
  or public.is_admin()
);
create policy home_banners_write on public.home_banners for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger trg_home_banners_updated
  before update on public.home_banners
  for each row execute function public.set_updated_at();

grant select on public.home_banners to anon, authenticated;
grant insert, update, delete on public.home_banners to authenticated;

-- 배너 이미지 버킷 (공개 읽기, 업로드는 service_role)
insert into storage.buckets (id, name, public)
values ('samae-banner', 'samae-banner', true)
on conflict (id) do nothing;

drop policy if exists "banner public read" on storage.objects;
create policy "banner public read"
  on storage.objects for select
  using (bucket_id = 'samae-banner');
