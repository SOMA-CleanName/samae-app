-- 0060 · 탐색 편집형 카테고리 (Explore editorial curation)
--
-- 탐색(/explore) 카테고리를 운영이 어드민에서 직접 만들고, 전체 published
-- 사진에서 손으로 골라 담는다. 태그 자동 매칭이 아닌 순수 수동(편집형) 멤버십.
-- 광고 랜딩 categories(/c/<slug>) 와는 별개 체계다. (docs/20)
--
--   explore_categories        : 카테고리 정의(운영 CRUD)
--   explore_category_photos    : 카테고리에 담은 사진 + 순서(position)

-- ── 카테고리 정의 ──────────────────────────────
create table if not exists public.explore_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- URL: /explore/<slug>
  title       text not null,                      -- 표시명: "일본 감성"
  subtitle    text not null default '',           -- 부제(선택)
  published   boolean not null default false,     -- 탐색 노출 여부
  sort        integer not null default 0,         -- 탐색 내 카테고리 정렬(오름차순)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_explore_categories_published
  on public.explore_categories (published, sort);

-- ── 멤버십(담은 사진 + 순서) ───────────────────
-- position 오름차순으로 노출. 사진 삭제 시 cascade 로 자동 정리.
create table if not exists public.explore_category_photos (
  category_id uuid not null references public.explore_categories(id) on delete cascade,
  photo_id    uuid not null references public.photos(id) on delete cascade,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (category_id, photo_id)
);

create index if not exists idx_ecp_category
  on public.explore_category_photos (category_id, position);

-- ── RLS ────────────────────────────────────────
-- 공개 카테고리와 그 멤버십은 누구나 조회, 관리는 운영자만.
alter table public.explore_categories enable row level security;
alter table public.explore_category_photos enable row level security;

drop policy if exists explore_categories_select on public.explore_categories;
create policy explore_categories_select on public.explore_categories
  for select using (published or public.is_admin());

drop policy if exists explore_categories_admin on public.explore_categories;
create policy explore_categories_admin on public.explore_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ecp_select on public.explore_category_photos;
create policy ecp_select on public.explore_category_photos
  for select using (
    public.is_admin() or exists (
      select 1 from public.explore_categories c
      where c.id = category_id and c.published
    )
  );

drop policy if exists ecp_admin on public.explore_category_photos;
create policy ecp_admin on public.explore_category_photos
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_explore_categories_updated on public.explore_categories;
create trigger trg_explore_categories_updated
  before update on public.explore_categories
  for each row execute function public.set_updated_at();

-- ── 시드: 기존 상수 20개를 껍데기로 생성(사진 미담김) ──
-- published=false 로 시작 — 운영이 사진 담고 준비되면 어드민에서 공개한다.
-- 사진 멤버십은 편집형이라 여기서 채우지 않는다. slug 는 로마자 고정.
insert into public.explore_categories (slug, title, sort) values
  ('japan',        '일본 감성',      10),
  ('vintage',      '빈티지·필름',    20),
  ('natural',      '내추럴 감성',    30),
  ('cinematic',    '시네마틱',       40),
  ('pinterest',    '핀터레스트 무드', 50),
  ('couple',       '커플 스냅',      60),
  ('friends',      '우정·단체',      70),
  ('wedding',      '웨딩 스냅',      80),
  ('self-wedding', '본식·셀프웨딩',   90),
  ('profile',      '개인·프로필',    100),
  ('hanbok',       '한복',          110),
  ('graduation',   '교복·졸업',      120),
  ('spring',       '벚꽃·봄',        130),
  ('summer',       '여름·바다',      140),
  ('nature',       '공원·자연',      150),
  ('street',       '골목·거리',      160),
  ('travel',       '여행',          170),
  ('night',        '야간 스냅',      180),
  ('pet',          '반려동물',       190),
  ('concept',      '과일·컨셉',      200)
on conflict (slug) do nothing;
