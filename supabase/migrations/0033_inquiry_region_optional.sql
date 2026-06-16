-- 0033 · 문의 상담 정보의 희망 지역을 선택 입력으로 변경
-- 필수 상담 정보는 인원, 사진 목적, 희망 일정으로 둔다.

alter table public.inquiries
  alter column region drop not null;
