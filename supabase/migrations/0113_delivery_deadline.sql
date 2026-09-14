-- 결과물 전달 기한과 작가측 취소 접수 (docs/35 P3).
--
-- 회원약관 10조 5항·작가약관 10조 2항: 상품에 적은 기한(없으면 촬영일부터 21일) 안에 전달하고,
-- 연장하려면 서비스 안에서 고객 동의를 받는다. 14일 이상 넘기면 고객이 전액 환불을 요구할 수 있다.

-- 1) 상품에 전달 기한(일). 예약 시 package_snapshot 에 함께 굳는다
alter table public.packages
  add column if not exists delivery_days integer not null default 21;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'packages_delivery_days_check') then
    alter table public.packages
      add constraint packages_delivery_days_check check (delivery_days between 1 and 90);
  end if;
end $$;

comment on column public.packages.delivery_days is '촬영일부터 결과물 전달까지 일수. 회원약관 10조 5항 기본 21일';

-- 2) 예약의 실제 기한 — 입금 확인 때 촬영일 + 일수로 계산해 굳히고, 연장 동의가 있으면 덮는다
alter table public.bookings
  add column if not exists delivery_due_at                timestamptz,
  add column if not exists delivery_extension_proposed_to timestamptz,   -- 작가가 제안한 새 기한 (고객 동의 전)
  add column if not exists notice_delivery_overdue_at     timestamptz;   -- 기한 초과 알림 발송 시각

comment on column public.bookings.delivery_due_at is '결과물 전달 기한 (lib/delivery-deadline.ts). 입금 확인 시 계산, 연장 동의 시 갱신';
comment on column public.bookings.delivery_extension_proposed_to is '작가가 제안한 연장 기한. 고객이 동의하면 delivery_due_at 으로 옮기고 비운다';

-- 3) 채팅 카드 — 연장 요청은 대화의 한 사건이라 타임라인 말풍선으로 남긴다 (contact_card 와 같은 방식)
alter type public.message_type add value if not exists 'extension_card';

-- 4) 작가측 취소 접수 — support_requests 종류에 추가 (취소환불 8조)
alter table public.support_requests drop constraint if exists support_requests_kind_check;
alter table public.support_requests
  add constraint support_requests_kind_check
  check (kind in ('refund', 'reschedule', 'other', 'photographer_cancel'));
