-- 추가 결제 — 회원약관 8조, 작가약관 7조 4항.
--
-- 예약 확정 후 상품에 없는 추가 작업이 필요하면 작가가 항목과 금액을 적어 요청하고, 회원이 수락해
-- 결제한 때 그 부분의 계약이 성립한다. 회원은 거부할 수 있고 그러면 원 계약은 그대로다.
--
-- 정책팀 확정(2026-09-14): 추가 결제 금액은 촬영 대금에 포함된다.
--   · 촬영 전(pre_shoot)  추가 결제 → 원 예약과 합산해 위약금 규정을 그대로 적용. 입금 확인 때
--                           bookings.amount_krw·fee_snapshot·platform_fees 를 다시 계산한다.
--   · 촬영 후(post_shoot) 결과물에 관한 추가 결제 → 그 결과물 전달 전에는 전액 환불, 전달 후에는 환불 없음.
--                           수수료·정산은 이 행이 따로 갖는다 (platform_fees 는 예약당 한 행이라).
--
-- 돈이 오가고 어드민 확인이 필요해 테이블을 둔다. 채팅 카드는 extra_card 말풍선(body=JSON)으로 이 행을 가리킨다.

create table if not exists public.booking_extras (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings(id) on delete cascade,
  title                 text not null,
  amount_krw            integer not null check (amount_krw > 0),
  kind                  text not null check (kind in ('pre_shoot', 'post_shoot')),
  status                text not null default 'requested'
                        check (status in ('requested', 'accepted', 'declined', 'paid', 'refunded', 'cancelled')),
  requested_by          uuid references public.profiles(id) on delete set null,
  transfer_marked_at    timestamptz,   -- 고객이 [입금 완료]를 누른 시각
  paid_at               timestamptz,   -- 사매가 입금을 확인한 시각
  delivered_at          timestamptz,   -- post_shoot: 작가가 결과물을 전달한 시각 (이후 환불 없음)
  refunded_at           timestamptz,
  refund_krw            integer,
  fee_snapshot          jsonb,         -- post_shoot 만. pre_shoot 은 예약의 fee_snapshot 에 합산
  settled_at            timestamptz,   -- post_shoot 만
  settlement_amount_krw integer,
  created_at            timestamptz not null default now()
);

create index if not exists idx_booking_extras_booking on public.booking_extras (booking_id, created_at);

alter table public.booking_extras enable row level security;

-- 예약 당사자만 본다. 쓰기는 service_role (서버 액션).
drop policy if exists booking_extras_select on public.booking_extras;
create policy booking_extras_select on public.booking_extras
  for select using (
    exists (
      select 1 from public.bookings b
      left join public.photographers p on p.id = b.photographer_id
      where b.id = booking_extras.booking_id
        and (b.user_id = auth.uid() or p.profile_id = auth.uid())
    )
  );

comment on table public.booking_extras is
  '추가 결제 요청·결제·전달·환불. pre_shoot 는 입금 확인 시 예약 총액에 합산, post_shoot 는 이 행이 따로 수수료·정산을 갖는다';

alter type public.message_type add value if not exists 'extra_card';
