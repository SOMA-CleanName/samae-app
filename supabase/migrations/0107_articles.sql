-- ════════════════════════════════════════════════════════════════
-- 0107 · 아티클 — 운영자가 쓰는 마크다운 글 (2026-08-31)
--   · 스냅 촬영 정보 비대칭을 줄이는 롱폼 콘텐츠. 검색·AI 답변 유입의 본체다.
--   · 배너(home_banners.link_url)·탐색 탭에서 진입한다.
--   · 본문은 마크다운. 이미지는 본문 안에 URL 로 넣고, 대표 이미지만 별도 컬럼.
--
--   왜 파일이 아니라 DB 인가: 배너와 같은 흐름으로 **운영자가 직접 쓰고 고친다.**
--   레포 .md 로 두면 글 하나 고칠 때마다 배포가 필요하다.
--
--   재사용: RLS 헬퍼 is_admin, set_updated_at 트리거, samae-banner 버킷(이미지 공용).
-- ════════════════════════════════════════════════════════════════

create table public.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,            -- URL. 한글 허용(검색에서 키워드가 URL 에 들어가는 게 유리)
  title        text not null,
  summary      text not null default '',        -- 목록·검색 결과·OG 설명에 쓰인다
  body_md      text not null default '',        -- 마크다운 본문
  cover_url    text,                            -- 대표 이미지(목록·OG). 없으면 이미지 없이 렌더
  cover_alt    text not null default '',
  published    boolean not null default false,  -- 기본 비공개. 다 쓰고 켠다
  sort_order   integer not null default 0,      -- 목록 정렬(작을수록 앞)
  published_at timestamptz,                     -- 공개 시각. Article 구조화데이터의 datePublished
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 공개 목록 조회용(published + 정렬). slug 는 unique 인덱스가 이미 있다.
create index idx_articles_live on public.articles (published, sort_order, published_at desc);

alter table public.articles enable row level security;

-- 조회: 공개된 것은 누구나 / 운영자는 전부(비공개 초안 포함)
create policy articles_select on public.articles for select using (
  published or public.is_admin()
);
create policy articles_write on public.articles for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger trg_articles_updated
  before update on public.articles
  for each row execute function public.set_updated_at();

grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;

-- 공개로 바뀌는 순간 published_at 을 채운다.
-- 운영자가 껐다 켜도 최초 공개 시각을 유지한다 — 검색엔진에 날짜가 요동치면 안 된다.
create or replace function public.set_article_published_at()
returns trigger language plpgsql as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

create trigger trg_articles_published_at
  before insert or update on public.articles
  for each row execute function public.set_article_published_at();
