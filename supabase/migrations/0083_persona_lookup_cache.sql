-- ════════════════════════════════════════════════════════════════
-- 0083 · 인스타 프로필 조회 공유 캐시
--
-- 배경(2026-08-20 실사례): 프로필 사전조회가 전부 맥미니 단일 IP 로 나가는데,
-- 테스트 폭주만으로도 인스타가 그 IP 를 일시 제한했다. 기존 캐시는 서버 인스턴스별
-- 메모리라 Vercel 인스턴스마다 같은 아이디를 따로 조회한다 — 호출량을 줄이려면
-- 캐시를 인스턴스 간에 공유해야 한다.
--
-- found 24h · not_found 6h 캐시. 프로필(이름·팔로워·아바타)은 하루 안에 의미 있게
-- 변하지 않고, 바이럴 상황에선 소수의 인기 아이디가 반복 조회되므로 효과가 크다.
--
-- 되돌리기:
--   drop table if exists public.persona_lookup_cache;
-- ════════════════════════════════════════════════════════════════

create table if not exists public.persona_lookup_cache (
  username    text primary key,          -- 정규화(소문자, @ 제거)된 아이디
  result      jsonb not null,            -- LookupResult 직렬화 (unavailable 은 저장 안 함)
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_persona_lookup_cache_expires
  on public.persona_lookup_cache (expires_at);

comment on table public.persona_lookup_cache is
  '인스타 프로필 사전조회 공유 캐시 — 단일 유출구 IP 의 인스타 호출량 절감용. 서버 전용.';

-- 서버(서비스 롤) 전용 — 0077 persona_results 와 동일한 노출 정책
alter table public.persona_lookup_cache enable row level security;
revoke all on table public.persona_lookup_cache from anon, authenticated;
