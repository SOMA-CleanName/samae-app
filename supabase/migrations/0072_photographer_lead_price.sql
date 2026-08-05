-- ════════════════════════════════════════════════════════════════
-- 0072 · 작가별 리드 단가
--
-- 지금까지 리드 언락 단가(= 작가가 건당 우리 계좌로 입금하는 금액)는
-- inquiries.deposit_amount_krw 의 DB 기본값 6000 으로 전 작가 동일했다.
-- 작가마다 단가가 다르므로 어드민(/admin/photographers)에서 관리한다.
--
--   photographers.lead_price_krw           : 작가별 단가. null 이면 기본 단가 사용
--   platform_account.default_lead_price_krw: 전체 기본 단가(싱글턴 1행)
--
-- 접수 시점에 inquiries.deposit_amount_krw 로 스냅샷된다(아래 트리거).
-- 이미 해제 신청/입금확인된 건은 금액이 확정된 것이라 그대로 두고,
-- 아직 미해제(status='new')인 리드만 어드민 저장 시 새 단가로 갱신한다(어드민 액션).
-- ════════════════════════════════════════════════════════════════

-- 1) 컬럼
alter table public.photographers
  add column if not exists lead_price_krw integer;

alter table public.photographers drop constraint if exists photographers_lead_price_check;
alter table public.photographers
  add constraint photographers_lead_price_check
  check (lead_price_krw is null or (lead_price_krw >= 0 and lead_price_krw <= 10000000));

alter table public.platform_account
  add column if not exists default_lead_price_krw integer not null default 6000;

alter table public.platform_account drop constraint if exists platform_account_default_lead_price_check;
alter table public.platform_account
  add constraint platform_account_default_lead_price_check
  check (default_lead_price_krw >= 0 and default_lead_price_krw <= 10000000);

-- 2) 단가 변경 가드
-- photographers_update RLS 는 본인 행 수정을 허용한다(0002 참고).
-- 단가는 정산 금액이므로 status 와 동일하게 운영자/서버만 바꿀 수 있어야 한다.
create or replace function public.guard_photographer_lead_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_price_krw is distinct from old.lead_price_krw then
    if current_user <> 'service_role' and not public.is_admin() then
      raise exception '리드 단가 변경 권한이 없습니다 (운영자/서버 전용)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_photographers_lead_price_guard on public.photographers;
create trigger trg_photographers_lead_price_guard
  before update on public.photographers
  for each row execute function public.guard_photographer_lead_price();

-- 3) 접수 시 단가 스냅샷
-- 어떤 경로로 insert 되든(문의 폼·어드민·시드) 동일하게 적용되도록 트리거에서 채운다.
create or replace function public.set_inquiry_deposit_amount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_price integer;
begin
  select coalesce(p.lead_price_krw, a.default_lead_price_krw, 6000)
    into v_price
    from public.photographers p
    left join public.platform_account a on a.id = true
   where p.id = new.photographer_id;

  new.deposit_amount_krw := coalesce(
    v_price,
    (select default_lead_price_krw from public.platform_account where id = true),
    6000
  );
  return new;
end;
$$;

drop trigger if exists trg_inquiry_deposit_amount on public.inquiries;
create trigger trg_inquiry_deposit_amount
  before insert on public.inquiries
  for each row execute function public.set_inquiry_deposit_amount();
