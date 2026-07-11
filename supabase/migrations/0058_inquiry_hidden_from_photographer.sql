-- 0058 · 문의 건당 '작가에게서 숨기기'(운영 취소)
-- 장난·스팸·오접수 등을 운영진이 처리할 때, 어드민에는 남기되 해당 작가의
-- 문의 목록에서만 사라지게 하는 플래그. 하드 삭제(복구 불가)와 달리 되돌릴 수 있다.
alter table public.inquiries
  add column if not exists hidden_from_photographer boolean not null default false;
