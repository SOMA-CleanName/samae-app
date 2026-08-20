-- 0077 · 페르소나 이벤트 — 결과 캐시 · 공유 영속 · 레이트리밋 근거
--
-- 배경: /event/persona 는 1회 실행마다 Apify 스크래핑 + Claude 2회를 태운다(건당 $0.05~0.18).
-- 인증 없이 누구나 호출 가능하고 재요청 캐시도 없어, 바이럴 트래픽이 그대로 비용이 된다.
-- 또한 결과를 저장하지 않아 공유 링크로 들어온 친구가 결과를 볼 수 없다 → 바이럴 루프가 끊긴다.
--
-- 이 테이블 하나가 세 가지를 동시에 해결한다.
--   1) 캐시    — username_hash 로 TTL 안의 기존 결과 재사용 (원가 절감)
--   2) 공유    — id(uuid, 추측 불가)로 결과 페이지 재현
--   3) 레이트리밋 — ip_hash + created_at 으로 최근 실행 횟수 집계
--
-- 개인정보: 인스타 아이디와 IP 는 평문으로 저장하지 않는다(둘 다 sha256 해시).
-- 원본 게시물·캡션·이미지도 저장하지 않는다 — LLM 산출물(persona/shoot)과 사진 id 만 남긴다.

create table if not exists public.persona_results (
  id            uuid primary key default gen_random_uuid(),
  -- sha256(lower(username)) — 캐시 조회 키. 평문 아이디는 저장하지 않는다.
  username_hash text,
  method        text not null check (method in ('instagram', 'upload')),
  -- Stage1(심리) / Stage2(촬영 페르소나) LLM 산출물
  persona       jsonb not null,
  shoot         jsonb not null,
  -- 결과 화면에 띄운 추천 사진. 공유 링크 재현 시 같은 사진을 보여주기 위함.
  photo_ids     uuid[] not null default '{}',
  -- sha256(ip + 서버 솔트) — 레이트리밋 전용. 역추적 불가.
  ip_hash       text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '72 hours')
);

-- 캐시 조회: 같은 아이디의 아직 안 만료된 결과
create index if not exists idx_persona_results_cache
  on public.persona_results (username_hash, expires_at desc)
  where username_hash is not null;

-- 레이트리밋: 특정 IP 의 최근 실행 횟수
create index if not exists idx_persona_results_ip
  on public.persona_results (ip_hash, created_at desc)
  where ip_hash is not null;

-- 만료분 정리용
create index if not exists idx_persona_results_expires
  on public.persona_results (expires_at);

-- RLS: 정책을 두지 않아 anon/authenticated 는 접근 불가.
-- 읽기·쓰기는 전부 서버(service_role)에서만 — 서버 컴포넌트·서버 액션 경유.
-- 공유 링크도 서버에서 렌더하므로 공개 정책이 필요 없다.
alter table public.persona_results enable row level security;

comment on table public.persona_results is
  '페르소나 이벤트 결과 — 캐시(72h)·공유 링크·레이트리밋 근거. 아이디/IP 는 해시로만 저장.';
