-- ════════════════════════════════════════════════════════════════
-- 0096 · 작가 안내 이미지 + 작가 KB (2026-08-27)
--   · photographer_guide_images : 작가가 고객에게 촬영 때 주는 안내 이미지
--       사진 상세("이 사진을 찍은 패키지 정보" 아래)에 세로로 노출 → 탭하면 스와이프 뷰어
--   · photographer_bot_kb : 챗봇이 근거로 삼는 지식카드 문서(jsonb)
--       이번 단계에서는 **운영진이 어드민에서 JSON 을 직접 넣는다**.
--       (bot-kb-data.ts 하드코딩 → DB 이관, 파일은 폴백으로만 남김)
--   재사용: RLS 헬퍼 is_admin, set_updated_at 트리거.
-- ════════════════════════════════════════════════════════════════

-- ── 작가 안내 이미지 ────────────────────────────────────────────
create table if not exists public.photographer_guide_images (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  image_url       text not null,
  thumb_url       text,
  width           integer,
  height          integer,
  caption         text not null default '',   -- 뷰어 하단 설명(선택)
  published       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_guide_images_owner
  on public.photographer_guide_images (photographer_id, published, sort_order);

alter table public.photographer_guide_images enable row level security;

-- 조회: 공개분은 누구나(비로그인 사진 상세 포함) / 작가 본인·운영자는 전부
drop policy if exists "guide_images_select" on public.photographer_guide_images;
create policy "guide_images_select" on public.photographer_guide_images
  for select using (
    published
    or public.is_admin()
    or exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

-- 작성·수정·삭제: 작가 본인 (운영 도구는 service_role 로 우회)
drop policy if exists "guide_images_write_own" on public.photographer_guide_images;
create policy "guide_images_write_own" on public.photographer_guide_images
  for all
  using (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

drop trigger if exists trg_guide_images_updated on public.photographer_guide_images;
create trigger trg_guide_images_updated
  before update on public.photographer_guide_images
  for each row execute function public.set_updated_at();

grant select on public.photographer_guide_images to anon, authenticated;
grant insert, update, delete on public.photographer_guide_images to authenticated;

-- 안내 이미지 버킷 (공개 읽기, 업로드는 service_role 라우트)
insert into storage.buckets (id, name, public)
values ('samae-guide', 'samae-guide', true)
on conflict (id) do nothing;

drop policy if exists "guide public read" on storage.objects;
create policy "guide public read"
  on storage.objects for select
  using (bucket_id = 'samae-guide');

-- ── 작가 KB (운영 입력 JSON) ────────────────────────────────────
-- cards 형태: [{ "id": "pkg-solo", "topic": "가격", "body": "...", "source": "운영 확인" }, ...]
-- src/lib/bot-kb.ts 의 KbCard 와 1:1. 검증은 앱(normalizeKbCards)에서 한다.
create table if not exists public.photographer_bot_kb (
  photographer_id uuid primary key references public.photographers(id) on delete cascade,
  cards           jsonb not null default '[]'::jsonb,
  greeting        text not null default '',   -- 비면 기본 인사말
  enabled         boolean not null default true,
  note            text not null default '',   -- 운영 메모(출처·확인일 등). 봇에 주입하지 않음
  updated_at      timestamptz not null default now()
);

alter table public.photographer_bot_kb enable row level security;

-- 조회: 작가 본인(스튜디오에서 내 봇이 뭘 아는지 확인) + 운영자. 봇 서버는 service_role.
drop policy if exists "bot_kb_select" on public.photographer_bot_kb;
create policy "bot_kb_select" on public.photographer_bot_kb
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

-- 작성·수정은 운영자만 (이번 단계 정책: 운영진이 JSON 을 직접 넣는다)
drop policy if exists "bot_kb_write_admin" on public.photographer_bot_kb;
create policy "bot_kb_write_admin" on public.photographer_bot_kb
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.photographer_bot_kb to authenticated;
grant insert, update, delete on public.photographer_bot_kb to authenticated;
