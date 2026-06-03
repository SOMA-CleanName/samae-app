-- ════════════════════════════════════════════════════════════════
-- 0007 · 직접 계좌이체 + 건당 정액 수수료 모델로 전환
--
-- 변경 배경(2026-06-02 결정): PG(에스크로)를 끼지 않고 사용자가 작가에게
-- 직접 계좌이체한다. 플랫폼은 매칭 건당 6,000원 수수료를 "작가"에게 부과하며,
-- 입금 확인(accepted→paid) 시점에 발생시켜 월 단위로 누적·청구한다.
--
-- 이 마이그레이션:
--   1) payout_accounts  : 작가 수취 계좌(촬영비 받을 계좌). 소유자만 직접 조회,
--                         구매자에게는 서버(service_role) 경유로만 노출.
--   2) platform_fees    : 작가가 낼 플랫폼 수수료 원장(구 settlements 대체).
--   3) 구 모델 정리       : settlements 테이블·settlement_status enum·
--                         photographers.settlement_account 컬럼 제거.
--   4) payments         : 직접이체 확인 기록으로 의미 전환(method 컬럼 추가).
-- write 는 전부 service_role 전용, RLS 는 조회 게이트만 담당한다.
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. 작가 수취 계좌
-- ─────────────────────────────────────────────
create table public.payout_accounts (
  photographer_id uuid primary key references public.photographers(id) on delete cascade,
  bank        text not null,
  number      text not null,
  holder      text not null,
  updated_at  timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;

-- 소유 작가/운영자만 직접 조회. (구매자 노출은 서버 함수가 service_role 로 처리)
create policy payout_accounts_select on public.payout_accounts for select
  using (public.is_my_photographer(photographer_id) or public.is_admin());

create trigger trg_payout_accounts_updated
  before update on public.payout_accounts
  for each row execute function public.set_updated_at();

-- 구 정산계좌 컬럼 제거 (구 모델 전용, 데모 데이터만 존재)
alter table public.photographers drop column if exists settlement_account;

-- ─────────────────────────────────────────────
-- 2. 플랫폼 수수료 원장 (작가가 낼 매칭 수수료)
-- ─────────────────────────────────────────────
-- accrued : 발생(미청구) · billed : 청구됨 · paid : 작가 납부 · waived : 면제(환불 등)
create type platform_fee_status as enum ('accrued', 'billed', 'paid', 'waived');

create table public.platform_fees (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings(id) on delete restrict,
  photographer_id uuid not null references public.photographers(id) on delete restrict,
  fee_krw         integer not null default 6000,
  status          platform_fee_status not null default 'accrued',
  period          text,                         -- 청구 주기 'YYYY-MM'
  accrued_at      timestamptz not null default now(),
  billed_at       timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_platform_fees_ph on public.platform_fees (photographer_id, status);

alter table public.platform_fees enable row level security;

-- 작가 본인/운영자만 조회
create policy platform_fees_select on public.platform_fees for select
  using (public.is_my_photographer(photographer_id) or public.is_admin());

create trigger trg_platform_fees_updated
  before update on public.platform_fees
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- 3. 구 정산 테이블 폐기
-- ─────────────────────────────────────────────
drop table if exists public.settlements;
drop type if exists settlement_status;

-- ─────────────────────────────────────────────
-- 4. payments : 직접이체 확인 기록으로 의미 전환
--    (provider='bank_transfer', amount_krw=촬영비, paid_at=작가 확인 시각)
-- ─────────────────────────────────────────────
alter table public.payments add column if not exists method text;

-- ─────────────────────────────────────────────
-- 5. 권한 grant (RLS 가 행 접근 게이트)
-- ─────────────────────────────────────────────
grant select on public.payout_accounts to authenticated;
grant select on public.platform_fees   to authenticated;
