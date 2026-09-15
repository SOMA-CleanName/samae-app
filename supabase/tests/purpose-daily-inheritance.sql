\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'samae_purpose_qa' or exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','f')
  ) then raise exception 'Only an empty isolated samae_purpose_qa database is allowed'; end if;
end $$;
create role anon;
create role authenticated;
create role service_role;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
create function public.is_service_context() returns boolean language sql stable as
$$ select current_user in ('service_role','postgres','supabase_admin') $$;
create table public.packages(id uuid primary key, photographer_id uuid);
create table public.albums(id uuid primary key, photographer_id uuid,
  package_id uuid references public.packages, updated_at timestamptz default now());
create table public.photos(id uuid primary key,album_id uuid references public.albums,visibility text default 'published');
\ir ../migrations/0113_photo_purpose_classification.sql
\ir ../migrations/0114_photo_purpose_review.sql
\ir ../migrations/0115_photo_purpose_text_first.sql
\ir ../migrations/0116_multiple_photo_purposes.sql
\ir ../migrations/0117_private_admin_portfolio_packages.sql
\ir ../migrations/0118_daily_photo_purpose_inheritance.sql
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as
$$ begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
insert into albums(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
select set_album_admin_purposes('00000000-0000-0000-0000-000000000001',array['wedding','pet']);
insert into photos(id,album_id) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000002');
select set_photo_admin_purposes('00000000-0000-0000-0000-000000000012',array['personal']);
update photos set visibility='draft' where id::text like '%013';
update photos set admin_purpose_reviewed=true where id::text like '%014';
create temporary table albums_before as select * from albums;
create temporary table protected_before as select * from photos where id::text not like '%011';
set local role service_role;
select pg_temp.assert(backfill_inherited_photo_purposes()=1,'only new public unreviewed photo inherits');
select pg_temp.assert(backfill_inherited_photo_purposes()=0,'second run is a noop');
reset role;
select pg_temp.assert((select admin_purposes=array['wedding','pet'] and admin_purpose='wedding'
  and admin_purpose_source='manual' and admin_purpose_reviewed and not admin_purpose_overridden from photos where id::text like '%011'),'inherits full manual set without new AI classification');
select pg_temp.assert(not exists((select * from albums except select * from albums_before) union all (select * from albums_before except select * from albums)),'albums unchanged');
select pg_temp.assert(not exists((select * from photos where id::text not like '%011' except select * from protected_before) union all (select * from protected_before except select * from photos)),'other photos unchanged');
set local role authenticated;
do $$ begin
  begin perform public.backfill_inherited_photo_purposes();
  exception when insufficient_privilege then return; end;
  raise exception 'ordinary user must not run inheritance';
end $$;
reset role;
-- 내부 연결 해제/상품 삭제도 다음 일일 분류에서 변경으로 감지한다.
update albums set photographer_id='00000000-0000-0000-0000-000000000099' where id::text like '%002';
insert into packages values ('00000000-0000-0000-0000-000000000088','00000000-0000-0000-0000-000000000099');
select set_album_admin_package('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000088');
update albums set updated_at='2026-01-01',admin_purpose_at='2026-01-01' where id::text like '%002';
select set_album_admin_package('00000000-0000-0000-0000-000000000002',null);
select pg_temp.assert((select updated_at>admin_purpose_at and package_id is null from albums where id::text like '%002'),'internal unlink marks input changed without public package assignment');
select set_album_admin_package('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000088');
update albums set updated_at='2026-01-01' where id::text like '%002';
delete from packages where id::text like '%088';
select pg_temp.assert((select updated_at>admin_purpose_at and package_id is null from albums where id::text like '%002'),'package cascade deletion marks input changed');
rollback;
