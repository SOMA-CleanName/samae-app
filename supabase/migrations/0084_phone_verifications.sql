-- 전화번호 OTP 인증 (가입 마무리 /signup/contact)
-- 코드는 해시로만 저장. 접근은 service role 전용 — RLS 켜고 정책 없음.
create table if not exists public.phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  phone       text not null,                -- 010-1234-5678 (하이픈 포함 표준형)
  code_hash   text not null,               -- sha256(code + OTP_PEPPER)
  attempts    int  not null default 0,     -- 검증 실패 횟수 (5회 초과 시 폐기)
  expires_at  timestamptz not null,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.phone_verifications enable row level security;

-- 조회 패턴: 사용자별 최신 활성 코드 / 발송 레이트리밋 집계
create index if not exists phone_verifications_user_created_idx
  on public.phone_verifications (user_id, created_at desc);
create index if not exists phone_verifications_phone_created_idx
  on public.phone_verifications (phone, created_at desc);
