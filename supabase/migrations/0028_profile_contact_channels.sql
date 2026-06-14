-- 0028 · 프로필 연락 수단 확장
-- 문의 폼에서 전화번호 외 인스타/디스코드/이메일 연락처를 저장한다.

alter table public.profiles
  add column if not exists instagram_id text,
  add column if not exists discord_id text,
  add column if not exists contact_email text;
