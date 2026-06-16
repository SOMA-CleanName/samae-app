-- 0041 · 문의 상태값 개정
-- 후속 단계(contacted/converted/closed)를 제거하고 운영 흐름에 맞춰 shot(촬영완료)/refund_requested(환불신청) 추가.
-- 상태(stage):
--   new              : 접수 (작가 미수락)
--   accepted         : 입금대기 (해제 신청 후 운영자 확인 전)
--   confirmed        : 입금확인 (연락처 공개)
--   shot             : 촬영완료
--   refund_requested : 환불신청

-- 1) 기존 제약 제거
alter table public.inquiries drop constraint if exists inquiries_status_check;

-- 2) 폐기되는 상태값 데이터 정리 — 모두 '입금확인(confirmed)' 후 단계였으므로 confirmed 로 수렴
update public.inquiries
set status = 'confirmed'
where status in ('contacted', 'converted', 'closed');

-- 3) 새 제약
alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('new', 'accepted', 'confirmed', 'shot', 'refund_requested'));
