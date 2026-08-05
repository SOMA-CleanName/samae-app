-- ════════════════════════════════════════════════════════════════
-- 0073 · 작가 가드 트리거의 service_role 판별 수정
--
-- 문제: guard_photographer_status(0002) · guard_photographer_lead_price(0072) 가
--       SECURITY DEFINER 로 선언돼 있다. DEFINER 함수 안에서 current_user 는
--       호출자가 아니라 함수 소유자(postgres) 로 고정되므로
--       `current_user <> 'service_role'` 이 항상 참 → 서버(service_role) 경로가 통째로 막혔다.
--       (어드민에서 리드 단가 저장 / 작가 신청 승인이 "권한이 없습니다" 로 실패)
--
-- 해결: 가드 함수는 권한이 필요 없다(참조하는 is_admin() 이 이미 SECURITY DEFINER).
--       SECURITY INVOKER 로 되돌려 current_user 가 실제 실행 role(service_role /
--       authenticated / anon) 을 가리키게 하고, PostgREST JWT role 클레임도 함께 본다.
-- ════════════════════════════════════════════════════════════════

-- 서버(service_role) 경로 판별 — PostgREST 는 SET ROLE service_role,
-- 마이그레이션·운영 스크립트는 postgres 로 직접 접속한다.
create or replace function public.is_service_context()
returns boolean language sql stable as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin')
      or coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
$$;

-- SECURITY DEFINER 를 떼려면 먼저 drop 해야 한다(create or replace 로는 못 바꿈).
drop trigger if exists trg_photographers_status_guard on public.photographers;
drop function if exists public.guard_photographer_status();

create function public.guard_photographer_status()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.status is distinct from old.status then
    -- service_role(서버 경로) 또는 운영자만 허용
    if not public.is_service_context() and not public.is_admin() then
      raise exception '작가 status 변경 권한이 없습니다 (운영자/서버 전용)';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_photographers_status_guard
  before update on public.photographers
  for each row execute function public.guard_photographer_status();

drop trigger if exists trg_photographers_lead_price_guard on public.photographers;
drop function if exists public.guard_photographer_lead_price();

create function public.guard_photographer_lead_price()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.lead_price_krw is distinct from old.lead_price_krw then
    if not public.is_service_context() and not public.is_admin() then
      raise exception '리드 단가 변경 권한이 없습니다 (운영자/서버 전용)';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_photographers_lead_price_guard
  before update on public.photographers
  for each row execute function public.guard_photographer_lead_price();
