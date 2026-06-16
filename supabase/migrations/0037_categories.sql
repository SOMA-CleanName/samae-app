-- 0037 · 카테고리 (운영자 정의, 데이터 기반)
-- 운영자가 카테고리를 만들고 태그를 매핑하면, 그 태그와 겹치는 사진들이 카테고리 페이지에 노출된다.
-- 광고는 카테고리별로 나뉘고, 카테고리 페이지(/c/<slug>)로 랜딩시킨다.

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,                 -- URL용 (예: portrait)
  name        text not null,                        -- 표시명 (예: 프로필/증명사진)
  description text not null default '',
  tags        text[] not null default '{}',         -- 이 카테고리에 해당하는 mood 태그들
  published   boolean not null default false,       -- 공개 여부(광고 랜딩 활성)
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_categories_published on public.categories (published, sort);

alter table public.categories enable row level security;

-- 공개된 카테고리는 누구나 조회(랜딩), 관리는 운영자만
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select using (published or public.is_admin());

drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated
  before update on public.categories
  for each row execute function public.set_updated_at();
