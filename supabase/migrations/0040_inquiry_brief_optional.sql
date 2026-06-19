-- 0040 · 촬영 문의 상담 정보 선택 입력화
-- 연락 가능한 수단만 있으면 문의 접수가 가능하도록 상담 정보 필수 제약을 푼다.

alter table public.inquiries
  alter column purpose drop not null,
  alter column preferred_date drop not null,
  alter column region drop not null;
