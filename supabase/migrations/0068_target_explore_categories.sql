-- 0068 · 타겟 카테고리 × 탐색 카테고리 체계
--
-- 개념 정리 (요구사항)
--  · 타겟 카테고리   = public.categories        (웨딩 / 커플·우정 / 인물·개인 / 감성·컨셉)
--  · 탐색 카테고리   = public.explore_categories (추천 무드 — 야외웨딩·빈티지·시크 …)
--  · 타겟 1개 안에 탐색 여러 개 (N:M — 하나의 무드를 여러 타겟이 공유할 수 있다)
--  · 작가는 포트폴리오(앨범) 1개당 타겟 1개 + 그 타겟에 속한 탐색 여러 개를 고른다.
--  · 사진 멤버십 = (포트폴리오 상속) ∪ (운영자 수동 추가) − (운영자 수동 제외)
--
-- 배열(explore_section_ids)은 호환을 위해 남기되, 읽기·쓰기는 아래 연결 테이블로 옮긴다.

-- ── 1) 타겟 ↔ 탐색 연결 (N:M, 순서 보존) ──────────────────────────
create table if not exists public.target_explore_categories (
  target_category_id  uuid not null references public.categories(id) on delete cascade,
  explore_category_id uuid not null references public.explore_categories(id) on delete cascade,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  primary key (target_category_id, explore_category_id)
);

create index if not exists idx_tec_target
  on public.target_explore_categories (target_category_id, position);
create index if not exists idx_tec_explore
  on public.target_explore_categories (explore_category_id);

-- 기존 categories.explore_section_ids 배열 → 행으로 이관(배열 순서를 position 으로)
insert into public.target_explore_categories (target_category_id, explore_category_id, position)
select c.id, e.id, (u.ord - 1)::int
from public.categories c
cross join lateral unnest(c.explore_section_ids) with ordinality as u(eid, ord)
join public.explore_categories e on e.id = u.eid
on conflict (target_category_id, explore_category_id) do nothing;

-- ── 2) 타겟별 '오늘의 큐레이션' 사진 (운영자 지정, 3장) ─────────────
-- 배열 FK 는 PG 미지원 — 정합성은 읽는 쪽에서 검증(ad_photo_ids 와 동일 패턴).
alter table public.categories
  add column if not exists curation_photo_ids uuid[] not null default '{}';

-- ── 3) 탐색 카테고리의 '타겟별 추천무드 대표 사진' ──────────────────
-- { "<타겟 카테고리 id>": "<사진 id>" } — 같은 무드라도 타겟에 따라 다른 컷을 건다.
-- (취향 테스트용 cover_by_purpose 와 별개. 목적 체계는 현행 유지)
alter table public.explore_categories
  add column if not exists cover_by_target jsonb not null default '{}'::jsonb;

-- ── 4) 작가의 포트폴리오(앨범) 단위 카테고리 선택 ────────────────────
alter table public.albums
  add column if not exists target_category_id uuid references public.categories(id) on delete set null;

create index if not exists idx_albums_target on public.albums (target_category_id);

create table if not exists public.album_explore_categories (
  album_id            uuid not null references public.albums(id) on delete cascade,
  explore_category_id uuid not null references public.explore_categories(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (album_id, explore_category_id)
);

create index if not exists idx_aec_explore
  on public.album_explore_categories (explore_category_id);

-- ── 5) 사진 단위 예외 (운영자가 개별 사진을 넣고 뺀다) ────────────────
-- explore_category_photos: 기존 행 = 손으로 담은 것 → source='manual'(기본값).
--   excluded=true 면 포트폴리오 상속분에서 그 사진만 뺀다.
alter table public.explore_category_photos
  add column if not exists source   text    not null default 'manual',
  add column if not exists excluded boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ecp_source_check'
  ) then
    alter table public.explore_category_photos
      add constraint ecp_source_check check (source in ('manual', 'portfolio'));
  end if;
end $$;

create index if not exists idx_ecp_excluded
  on public.explore_category_photos (category_id, excluded);

-- 타겟 카테고리도 같은 방식의 사진 단위 예외를 갖는다.
create table if not exists public.target_category_photos (
  category_id uuid not null references public.categories(id) on delete cascade,
  photo_id    uuid not null references public.photos(id) on delete cascade,
  excluded    boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (category_id, photo_id)
);

create index if not exists idx_tcp_category
  on public.target_category_photos (category_id, position);
create index if not exists idx_tcp_excluded
  on public.target_category_photos (category_id, excluded);

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.target_explore_categories enable row level security;
alter table public.album_explore_categories  enable row level security;
alter table public.target_category_photos    enable row level security;

-- 타겟↔탐색 연결: 공개 카테고리 조합은 누구나 조회, 관리는 운영자만
drop policy if exists tec_select on public.target_explore_categories;
create policy tec_select on public.target_explore_categories
  for select using (
    public.is_admin() or exists (
      select 1 from public.explore_categories e
      where e.id = explore_category_id and e.published
    )
  );

drop policy if exists tec_admin on public.target_explore_categories;
create policy tec_admin on public.target_explore_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- 앨범↔탐색 선택: 조회는 공개, 쓰기는 그 앨범의 작가 본인(또는 운영자)
drop policy if exists aec_select on public.album_explore_categories;
create policy aec_select on public.album_explore_categories
  for select using (true);

drop policy if exists aec_write on public.album_explore_categories;
create policy aec_write on public.album_explore_categories
  for all using (
    public.is_admin() or exists (
      select 1
      from public.albums a
      join public.photographers p on p.id = a.photographer_id
      where a.id = album_id and p.profile_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1
      from public.albums a
      join public.photographers p on p.id = a.photographer_id
      where a.id = album_id and p.profile_id = auth.uid()
    )
  );

-- 타겟 사진 예외: 공개 타겟의 행은 누구나 조회, 관리는 운영자만
drop policy if exists tcp_select on public.target_category_photos;
create policy tcp_select on public.target_category_photos
  for select using (
    public.is_admin() or exists (
      select 1 from public.categories c
      where c.id = category_id and c.published
    )
  );

drop policy if exists tcp_admin on public.target_category_photos;
create policy tcp_admin on public.target_category_photos
  for all using (public.is_admin()) with check (public.is_admin());
