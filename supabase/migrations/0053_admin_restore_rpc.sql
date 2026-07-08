-- 0053 · 어드민 삭제 복구(restore) RPC
-- deleted_records 의 지정 행을 원본 테이블로 되돌린다(0051/0052 삭제의 대칭).
-- FK 정합성을 위해 부모→자식(rank 오름차순) 순으로 복구, 전체 단일 트랜잭션.
-- PK/유니크 중복(이미 복구됨)은 skip, FK 위반(부모 소실)은 예외로 전체 롤백.
-- 서버(service_role)에서만 호출.

create or replace function public.admin_restore_records(
  p_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  for rec in
    select dr.id, dr.table_name, dr.data,
      case dr.table_name
        when 'profiles' then 10
        when 'categories' then 10
        when 'analytics_events' then 10
        when 'packages' then 20
        when 'albums' then 20
        when 'highlights' then 20
        when 'inquiries' then 20
        when 'conversations' then 20
        when 'bookings' then 30
        when 'photos' then 30
        else 40 -- payments·platform_fees·messages·consultation_briefs·highlight_items 등 자식
      end as rank
    from public.deleted_records dr
    where dr.id = any(p_ids)
    order by rank asc
  loop
    if to_regclass('public.' || rec.table_name) is null then
      continue; -- 없는 테이블은 건너뜀
    end if;
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing',
      rec.table_name, rec.table_name
    ) using rec.data;
    delete from public.deleted_records where id = rec.id;
  end loop;
end;
$$;

revoke all on function public.admin_restore_records(uuid[]) from public;
grant execute on function public.admin_restore_records(uuid[]) to service_role;
