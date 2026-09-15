-- 환불 처리 절차 — 작가 합의와 실제 송금을 기록한다
--
-- 지금까지 어드민의 [환불] 은 누르면 곧바로 실행됐다. 그런데 환불은 작가 수익이 걸린
-- 일이라 **먼저 작가와 이야기하고** 실행해야 한다. 그 대화는 카톡에서 벌어지고 시스템
-- 밖에 있으므로, 최소한 "합의를 확인했다" 는 사실은 여기 남긴다.
--
-- 그리고 `refundBooking()` 은 **원장 정리일 뿐 돈을 보내지 않는다.** 실제 송금은 PG
-- 지급대행에서 따로 한다. 그 두 개를 구분해 남기지 않으면 "환불됨" 으로 닫힌 건이
-- 실제로는 돈이 안 나간 상태일 수 있고, 그걸 알아챌 방법이 없다.

alter table public.support_requests
  -- 작가와 이야기해 합의된 시각. 이게 없으면 어드민 환불 버튼이 열리지 않는다
  add column if not exists photographer_ack_at   timestamptz,
  -- 누가 확인했는가 (어드민 profiles.id)
  add column if not exists photographer_ack_by   uuid references public.profiles(id) on delete set null,
  -- 작가가 뭐라고 했는지 — 나중에 분쟁이 나면 이 한 줄이 근거다
  add column if not exists photographer_ack_note text;

comment on column public.support_requests.photographer_ack_at is
  '작가와 합의를 확인한 시각. 환불 실행의 전제 — 없으면 어드민 환불 버튼이 잠긴다';
comment on column public.support_requests.photographer_ack_note is
  '작가가 뭐라고 했는지. 분쟁 시 근거가 되므로 요약이라도 남긴다';

alter table public.bookings
  -- PG 지급대행에서 실제로 송금한 시각. refunded_at(원장) 과 다른 사건이다
  add column if not exists refund_paid_at timestamptz,
  -- 누가 보냈는가
  add column if not exists refund_paid_by uuid references public.profiles(id) on delete set null;

comment on column public.bookings.refund_paid_at is
  'PG 지급대행에서 실제로 환불금을 보낸 시각. refunded_at 은 원장 정리일 뿐 돈이 나간 게 아니다';

-- 아직 안 보낸 환불 — 어드민이 매일 봐야 하는 목록이다 (3영업일 SLA)
create index if not exists idx_bookings_refund_unpaid
  on public.bookings (refunded_at)
  where refunded_at is not null and refund_paid_at is null;
