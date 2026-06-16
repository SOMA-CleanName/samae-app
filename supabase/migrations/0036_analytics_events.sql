-- 0036 · 행동 분석 이벤트 (페이지뷰·클릭/CTA). 운영자 전용 조회.
-- 적재는 서버(/api/track, service-role)만, 조회는 운영자만. anon 쓰기 미허용.

create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,                                  -- 브라우저 세션(이탈률 계산)
  profile_id  uuid references public.profiles(id) on delete set null, -- 로그인 시 누구
  type        text not null check (type in ('pageview', 'click')),
  path        text not null,                                  -- 발생 경로
  label       text,                                           -- 클릭: 버튼/링크 라벨
  target      text,                                           -- 클릭: href
  referrer    text,                                           -- 페이지뷰: 직전 경로
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_analytics_created on public.analytics_events (created_at desc);
create index if not exists idx_analytics_type_path on public.analytics_events (type, path, created_at desc);
create index if not exists idx_analytics_session on public.analytics_events (session_id, created_at);

alter table public.analytics_events enable row level security;

drop policy if exists analytics_admin_select on public.analytics_events;
create policy analytics_admin_select on public.analytics_events
  for select using (public.is_admin());
