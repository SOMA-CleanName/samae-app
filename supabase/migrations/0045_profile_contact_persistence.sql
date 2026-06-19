-- 0045 · 문의 폼 연락처 지속 저장
-- 회원이 한 번 입력한 카카오 아이디/기타 연락처를 다음 문의에서도 재사용한다.

alter table public.profiles
  add column if not exists kakao_id text,
  add column if not exists extra_contact text;

update public.profiles
set
  kakao_id = coalesce(kakao_id, discord_id),
  extra_contact = coalesce(extra_contact, contact_email)
where kakao_id is null
   or extra_contact is null;
