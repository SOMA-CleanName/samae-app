-- 0051 · 어드민 소프트딜리트 원자화 RPC
-- SELECT → deleted_records 아카이브 → DELETE 를 하나의 함수(=단일 트랜잭션)로 묶어
-- 중간 실패 시 전체 롤백. 다중 테이블도 한 번의 호출로 원자 삭제(정합성 보장).
-- 서버(service_role)에서만 호출. anon/authenticated 직접 실행 금지.

-- (A) 테이블 전체 초기화 — p_tables 순서대로(자식 FK 먼저) 아카이브 후 삭제.
--     없는 테이블은 건너뜀. 전체가 단일 트랜잭션이라 중간 실패 시 아무것도 지워지지 않음.
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
    execute format('delete from public.%I', t);
  end loop;
end;
$$;

-- (B) 조건부(행 단위) 삭제 — p_col 값이 p_vals 중 하나인 행을 아카이브 후 삭제.
--     id 등 컬럼 타입에 무관하도록 text 로 비교. 없는 테이블은 무시.
create or replace function public.admin_archive_delete_where(
  p_table text,
  p_col text,
  p_vals text[],
  p_deleted_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.' || p_table) is null then
    return; -- 없는 테이블 무시
  end if;
  execute format(
    'insert into public.deleted_records (table_name, record_id, data, deleted_by)
       select %L, (to_jsonb(x) ->> ''id''), to_jsonb(x), $1
       from public.%I x where x.%I::text = any($2)',
    p_table, p_table, p_col
  ) using p_deleted_by, p_vals;
  execute format(
    'delete from public.%I where %I::text = any($1)',
    p_table, p_col
  ) using p_vals;
end;
$$;

-- 클라이언트에서 직접 호출 차단 — 서버(service_role)만 실행.
revoke all on function public.admin_archive_delete_all(text[], uuid) from public;
revoke all on function public.admin_archive_delete_where(text, text, text[], uuid) from public;
grant execute on function public.admin_archive_delete_all(text[], uuid) to service_role;
grant execute on function public.admin_archive_delete_where(text, text, text[], uuid) to service_role;
