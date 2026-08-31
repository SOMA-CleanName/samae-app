-- 0101. 수수료 모델(정액·정률 공존) + 환불 판정에 필요한 시각 기록
--
-- docs/32-refund-policy.md 가 이 마이그레이션의 근거다.
--
-- 1) 수수료: 전역 정액 6,000원 하나였던 것을 **작가별 설정**으로 옮긴다.
--    정액과 정률이 동시에 살아 있어야 한다 — 작가를 한 명씩 정률로 옮기기 위해서다.
--    설정이 없는 작가(fee_mode='flat', fee_amount_krw is null)는 전역 기본값을 따르므로
--    이 마이그레이션만으로는 기존 작가의 수수료가 1원도 바뀌지 않는다.
--
-- 2) 예약 스냅샷: 요율을 바꾸거나 정액↔정률을 전환해도 지난 거래의 정산·환불 금액이
--    소급해 흔들리면 안 된다. 계산된 금액만이 아니라 모드·요율까지 남긴다.
--
-- 3) 연락처 교환 시각: 입금 확인 이후 교환이 허용되는데, 교환이 실제로 일어난 순간부터
--    환불이 50% 로 내려간다. '허용 시점'이 아니라 '실제 교환'이 기준이라 따로 기록한다.

-- ── 1) 작가별 수수료 설정 ──────────────────────────────────────
alter table public.photographers
  add column if not exists fee_mode       text    not null default 'flat',
  add column if not exists fee_amount_krw integer,          -- flat 일 때. null = 전역 기본(6,000)
  add column if not exists fee_rate       numeric(5,4);     -- rate 일 때. 0.1000 = 10%

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photographers_fee_mode_check'
  ) then
    alter table public.photographers
      add constraint photographers_fee_mode_check check (fee_mode in ('flat', 'rate'));
  end if;
  -- 정률인데 요율이 없으면 수수료가 0 이 된다 — 설정 실수로 매출이 사라지지 않게 막는다
  if not exists (
    select 1 from pg_constraint where conname = 'photographers_fee_rate_check'
  ) then
    alter table public.photographers
      add constraint photographers_fee_rate_check
      check (fee_mode <> 'rate' or (fee_rate is not null and fee_rate > 0 and fee_rate <= 0.5));
  end if;
end $$;

comment on column public.photographers.fee_mode is
  'flat=건당 정액, rate=촬영비 정률. docs/32';
comment on column public.photographers.fee_amount_krw is
  'flat 모드의 건당 수수료. null 이면 전역 기본값(PLATFORM_FEE_KRW)';
comment on column public.photographers.fee_rate is
  'rate 모드의 요율(0.1000 = 10%). 촬영비에만 적용 — 출장비에는 붙지 않는다';

-- ── 2) 예약 시점 수수료 스냅샷 ─────────────────────────────────
alter table public.bookings
  add column if not exists fee_snapshot jsonb;

comment on column public.bookings.fee_snapshot is
  '{mode, amountKrw?, rate?, shootFeeKrw, feeKrw} — 제안 시점의 수수료 계산 근거. docs/32';

-- ── 3) 연락처 교환 시각 ────────────────────────────────────────
alter table public.conversations
  add column if not exists contact_exchanged_at timestamptz;

comment on column public.conversations.contact_exchanged_at is
  '검열을 통과한 연락처가 처음 오간 시각. 이 시각 이후 환불은 50% 상한. docs/32 §3-3';

-- ── 4) 환불 기록 ───────────────────────────────────────────────
-- 금액·시점은 payments(refunded_krw) 가 원장이고, bookings 에는 사유만 남긴다.
alter table public.bookings
  add column if not exists refunded_at   timestamptz,
  add column if not exists refund_reason text;

comment on column public.bookings.refund_reason is
  '환불 판정 근거 (cooling_off | standard_50 | force_majeure | photographer_fault | ops). docs/32';
