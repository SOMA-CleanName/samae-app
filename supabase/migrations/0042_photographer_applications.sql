-- 0042 · 작가 신청(공개 리드)
-- 비로그인 작가 지원자가 남기는 신청. 삽입은 서버(service_role)가 수행하고, 조회는 운영자만.
-- 실제 진행은 운영자가 카카오 채널로 받은 메시지와 대조해 처리한다.

create table if not exists public.photographer_applications (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,                 -- 작가명
  portfolio_url text not null,                 -- 포트폴리오 링크(인스타·블로그 등)
  phone         text not null,                 -- 전화번호
  bio           text,                          -- 본인 소개(선택)
  status        text not null default 'new',   -- new | contacted | approved | rejected
  created_at    timestamptz not null default now()
);

create index if not exists idx_photographer_applications_created
  on public.photographer_applications (created_at desc);

alter table public.photographer_applications enable row level security;

-- 조회·관리는 운영자만. 삽입은 service_role 이 처리하므로 anon/auth 정책은 두지 않는다.
drop policy if exists photographer_applications_admin on public.photographer_applications;
create policy photographer_applications_admin on public.photographer_applications
  for all using (public.is_admin()) with check (public.is_admin());
