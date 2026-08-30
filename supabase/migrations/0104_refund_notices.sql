-- 0104. 환불 구간 전환 예고 알림의 발송 표시 (docs/32 §6-4·§6-5)
--
-- 하루 한 번 도는 크론이 보낸다. 표시가 없으면 크론이 다시 돌 때마다 같은 알림이 또 나가고,
-- "취소하면 위약금" 같은 문구가 반복되면 그게 곧 다크패턴으로 읽힌다.

alter table public.bookings
  add column if not exists notice_withdrawal_at   timestamptz,  -- 청약철회 종료 D-1
  add column if not exists notice_contact_open_at timestamptz,  -- 연락처 개방 안내
  add column if not exists notice_penalty_at      timestamptz;  -- 환불 마감 D-1

comment on column public.bookings.notice_withdrawal_at is
  '「내일부터 50% 위약금」 발송 시각. docs/32 §6-4';
comment on column public.bookings.notice_contact_open_at is
  '연락처 개방 안내 발송 시각. docs/32 §6-5';
comment on column public.bookings.notice_penalty_at is
  '「내일부터 환불 불가」 발송 시각. docs/32 §6-4';
