-- ════════════════════════════════════════════════════════════════
-- 0043 · 작가 신청 계정 연동 (로그인 필수 전환)
--   기존: photographer_applications 는 비로그인 공개 리드(계정 없음).
--   변경: 작가 신청은 로그인 후 /apply 에서만 가능 → 신청에 profile_id 를 연결.
--         어드민이 '승인'하면 그 계정으로 photographers(approved) 를 생성한다.
--   삽입은 서버(service_role), 조회·관리는 운영자만 (RLS 변경 없음).
--   적용: 운영(prod)은 Supabase SQL Editor 에 붙여넣어 실행.
-- ════════════════════════════════════════════════════════════════

alter table public.photographer_applications
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;

create index if not exists idx_photographer_applications_profile
  on public.photographer_applications (profile_id);

-- 한 계정당 '처리 전'(new·contacted) 신청은 1건만 — 중복 접수 방지
drop index if exists uniq_application_open_profile;
create unique index uniq_application_open_profile
  on public.photographer_applications (profile_id)
  where profile_id is not null and status in ('new', 'contacted');
