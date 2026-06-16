-- 0035 · 문의 입금 플로우
-- 작가가 문의를 수락하면 우리(플랫폼) 계좌로 건당 입금 → 운영자가 입금 확인 →
-- 그때 비로소 작가에게 고객 연락처가 공개된다(리드 언락 모델).
--
-- 상태(stage) 해석:
--   new        : 접수 (작가 미수락)
--   accepted   : 작가 수락 = 입금 대기 (deposit_confirmed_at IS NULL)
--   confirmed  : 운영자 입금 확인 = 연락처 공개 (deposit_confirmed_at 기록)
--   contacted/converted/closed : 이후 후속 단계(운영자 정리용)

-- 1) 입금 추적 컬럼
alter table public.inquiries
  add column if not exists deposit_amount_krw   integer not null default 6000,
  add column if not exists deposit_confirmed_at timestamptz,
  add column if not exists deposit_confirmed_by uuid references public.profiles(id) on delete set null;

-- 2) status 에 'confirmed' 추가
alter table public.inquiries drop constraint if exists inquiries_status_check;
alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('new', 'accepted', 'confirmed', 'contacted', 'converted', 'closed'));

create index if not exists idx_inquiries_status_created
  on public.inquiries (status, created_at desc);

-- 3) 플랫폼 입금 계좌 (싱글턴 1행)
create table if not exists public.platform_account (
  id         boolean primary key default true check (id),
  bank       text not null default '',
  number     text not null default '',
  holder     text not null default '',
  notice     text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.platform_account (id) values (true) on conflict (id) do nothing;

alter table public.platform_account enable row level security;

-- 로그인 사용자는 계좌 조회 가능(작가가 입금처 확인), 변경은 운영자만
drop policy if exists platform_account_select on public.platform_account;
create policy platform_account_select on public.platform_account
  for select using (auth.uid() is not null);

drop policy if exists platform_account_admin on public.platform_account;
create policy platform_account_admin on public.platform_account
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_platform_account_updated on public.platform_account;
create trigger trg_platform_account_updated
  before update on public.platform_account
  for each row execute function public.set_updated_at();
