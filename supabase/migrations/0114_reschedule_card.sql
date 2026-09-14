-- 일정 변경 — 서비스 안에서 제안하고 상대가 동의한다 (취소환불정책 7조).
--
-- 7조 1항: 회원이 요청하고 작가가 동의하면 남은 기간과 관계없이 위약금 없이 변경.
-- 7조 3항: 바뀐 날짜부터 다시 규정을 센다 (알림 발송 표시와 전달 기한도 다시 계산).
-- 7조 4항: 작가가 동의하지 않으면 고객은 원래 일정에 촬영하거나, 취소 신청으로 고객 사정 취소(위약금)를 한다.
--
-- 연락처 전달·전달 기한 연장과 같은 모양: 제안은 예약 컬럼, 사건은 말풍선(reschedule_card), 카드는 컬럼을 보고 그린다.
-- 별도 요청 테이블을 두지 않는다 (docs/35 "기존 구조에 맞추는 원칙").

alter table public.bookings
  add column if not exists reschedule_proposed_at   timestamptz,  -- 제안한 새 촬영 시각
  add column if not exists reschedule_proposed_date date,         -- 시간 미정이면 날짜만
  add column if not exists reschedule_proposed_by   text,         -- customer | photographer
  add column if not exists reschedule_proposed_on   timestamptz;  -- 제안한 시각 (거절 시 취소 시점 근거)

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_reschedule_by_check') then
    alter table public.bookings
      add constraint bookings_reschedule_by_check
      check (reschedule_proposed_by is null or reschedule_proposed_by in ('customer', 'photographer'));
  end if;
end $$;

comment on column public.bookings.reschedule_proposed_at is '답을 기다리는 일정 변경 제안. 동의하면 shoot_at 으로 옮기고 비운다';

alter type public.message_type add value if not exists 'reschedule_card';
