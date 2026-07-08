-- 0052 · 어드민 거래(booking) 선택삭제 원자 RPC
-- 선택한 booking id 집합을 restrict FK 자식(payments·platform_fees)부터 아카이브 후 삭제하고
-- 마지막에 bookings 를 삭제. 전체를 단일 트랜잭션으로 묶어 중간 실패 시 전체 롤백.
-- deliveries·reviews(cascade), conversations·messages(set null)는 DB 가 자동 처리.
-- 서버(service_role)에서만 호출.

create or replace function public.admin_delete_bookings(
  p_ids uuid[],
  p_deleted_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  child text;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return; -- 선택 없음
  end if;

  -- restrict FK 자식 먼저: booking_id 로 연결된 행 아카이브 후 삭제
  foreach child in array array['payments', 'platform_fees'] loop
    if to_regclass('public.' || child) is null then
      continue;
    end if;
    execute format(
      'insert into public.deleted_records (table_name, record_id, data, deleted_by)
         select %L, (to_jsonb(x) ->> ''id''), to_jsonb(x), $1
         from public.%I x where x.booking_id = any($2)',
      child, child
    ) using p_deleted_by, p_ids;
    execute format('delete from public.%I where booking_id = any($1)', child)
      using p_ids;
  end loop;

  -- 부모: bookings
  insert into public.deleted_records (table_name, record_id, data, deleted_by)
    select 'bookings', (to_jsonb(x) ->> 'id'), to_jsonb(x), p_deleted_by
    from public.bookings x where x.id = any(p_ids);
  delete from public.bookings where id = any(p_ids);
end;
$$;

revoke all on function public.admin_delete_bookings(uuid[], uuid) from public;
grant execute on function public.admin_delete_bookings(uuid[], uuid) to service_role;
