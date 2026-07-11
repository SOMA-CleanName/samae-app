-- 0056 · 전체 초기화 RPC 의 WHERE 없는 DELETE 수정
-- Supabase 의 sql_safe_updates 안전장치가 WHERE 없는 DELETE 를 차단해
-- 전체 초기화 시 "DELETE requires a WHERE clause" 에러가 발생했다.
-- 대상(테이블 전체)은 동일하되 항상 참인 `where true` 를 붙여 안전장치를 통과시킨다.
-- (조건부 삭제 admin_archive_delete_where 는 이미 WHERE 가 있어 영향 없음.)

create or replace function public.admin_archive_delete_all(
  p_tables text[],
  p_deleted_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  foreach t in array p_tables loop
    if to_regclass('public.' || t) is null then
      continue; -- 없는 테이블 무시
    end if;
    execute format(
      'insert into public.deleted_records (table_name, record_id, data, deleted_by)
         select %L, (to_jsonb(x) ->> ''id''), to_jsonb(x), $1
         from public.%I x',
      t, t
    ) using p_deleted_by;
    execute format('delete from public.%I where true', t); -- where true: 전체 삭제 + 안전장치 통과
  end loop;
end;
$$;

revoke all on function public.admin_archive_delete_all(text[], uuid) from public;
grant execute on function public.admin_archive_delete_all(text[], uuid) to service_role;
