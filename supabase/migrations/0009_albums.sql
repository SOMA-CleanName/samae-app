-- ════════════════════════════════════════════════════════════════
-- 0009 · 사진 묶음(앨범)
--
-- 배경(2026-06-04 결정): 함께 촬영한 사진을 "묶음"으로 올리고, 포트폴리오·
-- 공개 화면에서 하나의 세트로 묶여 보이게 한다(백로그 §1 묶음 업로드, Q1=영구 앨범).
-- 업로드 시 공통으로 가격·장소·무드태그·공개여부를 한 번에 부여한다.
--
--   - albums            : 묶음. 헤더 표시용 title·price_krw·location_text 보유.
--   - photos.album_id   : 사진이 속한 묶음(없으면 단독 사진).
-- 공통 가격/장소/무드/공개여부는 업로드 시 각 photos 행에도 복사한다.
-- → 탐색·검색·프로필의 기존 photos 기반 쿼리를 그대로 유지하기 위함.
-- ════════════════════════════════════════════════════════════════

create table public.albums (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  title           text,
  price_krw       integer,
  location_text   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_albums_photographer on public.albums (photographer_id);

-- photos → albums (단독 사진은 null). 정책이 album_id 를 참조하므로 정책보다 먼저 추가.
alter table public.photos
  add column if not exists album_id uuid references public.albums(id) on delete set null;

create index idx_photos_album on public.photos (album_id);

alter table public.albums enable row level security;

-- 조회: 소유 작가/운영자 + 공개 사진이 1장 이상 든 앨범(누구나)
create policy albums_select on public.albums for select
  using (
    public.is_my_photographer(photographer_id)
    or public.is_admin()
    or exists (
      select 1 from public.photos p
      where p.album_id = albums.id and p.visibility = 'published'
    )
  );

-- 쓰기: 소유 작가/운영자만
create policy albums_write on public.albums for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

create trigger trg_albums_updated
  before update on public.albums
  for each row execute function public.set_updated_at();

-- 테이블 레벨 grant (RLS 가 행 접근 게이트)
grant select, insert, update, delete on public.albums to anon, authenticated;
