-- ════════════════════════════════════════════════════════════════
-- 0002 · 작가 status 변경 가드
--
-- 문제: photographers_update RLS 정책이 본인(profile_id = auth.uid())의
--       update를 허용 → 작가가 스스로 status='approved' 로 승격 가능.
-- 해결: status 컬럼 변경은 운영자(is_admin) 또는 service_role(서버)만 허용.
--       (RLS는 컬럼 단위 제한이 어려우므로 BEFORE UPDATE 트리거로 가드)
-- ════════════════════════════════════════════════════════════════

create or replace function public.guard_photographer_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    -- service_role(서버 경로) 또는 운영자만 허용
    if current_user <> 'service_role' and not public.is_admin() then
      raise exception '작가 status 변경 권한이 없습니다 (운영자/서버 전용)';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_photographers_status_guard
  before update on public.photographers
  for each row execute function public.guard_photographer_status();
