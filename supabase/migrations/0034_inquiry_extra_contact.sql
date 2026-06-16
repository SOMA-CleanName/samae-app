-- 0034 · 문의 폼의 기타 연락처 자유 입력
-- 디스코드 아이디, 이메일 등 보조 연락 수단을 한 칸에 보관한다.

alter table public.inquiries
  add column if not exists extra_contact text;
