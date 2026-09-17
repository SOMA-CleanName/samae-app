\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'samae_packages_qa' or exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','f')
  ) then raise exception 'Only an empty isolated samae_packages_qa database is allowed'; end if;
end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create function public.is_admin() returns boolean language sql stable as
$$ select coalesce(current_setting('qa.admin',true),'false')='true' $$;
create table public.packages(id uuid primary key, photographer_id uuid);
create table public.albums(
  id uuid primary key, photographer_id uuid,
  package_id uuid references public.packages(id) on delete set null,
  price_krw integer, description text, admin_purposes text[], admin_purpose_reviewed boolean
);
\ir ../migrations/0117_private_admin_portfolio_packages.sql
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as
$$ begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.reject(statement text) returns void language plpgsql as
$$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'Expected rejection: %', statement;
end $$;
insert into packages values
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000091'),
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000091'),
  ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000092');
insert into albums values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000091',null,null,'original',array['wedding','pet'],true);
select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011');
select pg_temp.assert((select package_id is null and price_krw is null and admin_purposes=array['wedding','pet'] and admin_purpose_reviewed from albums),'internal assignment leaves author and review values intact');
select pg_temp.assert((select count(*)=1 from album_admin_packages),'internal assignment saved');
select pg_temp.reject($q$select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013')$q$);
select pg_temp.reject($q$select set_album_admin_package('00000000-0000-0000-0000-000000000099',null)$q$);

grant select,update on albums to authenticated;
set local role authenticated;
select pg_temp.assert((select count(*)=0 from album_admin_packages),'photographer cannot see internal assignments');
select pg_temp.reject($q$select set_album_admin_package('00000000-0000-0000-0000-000000000001',null)$q$);
select pg_temp.reject($q$update album_admin_packages set package_id='00000000-0000-0000-0000-000000000012'$q$);
select pg_temp.assert((select package_id is null from albums),'photographer sees no assigned package');
update albums set description='changed',package_id=null;
reset role;
select pg_temp.assert((select count(*)=1 from album_admin_packages),'metadata save without selecting a package preserves internal assignment');

set local role authenticated;
update albums set package_id='00000000-0000-0000-0000-000000000012',price_krw=120000;
reset role;
select pg_temp.assert((select count(*)=0 from album_admin_packages),'author selection removes internal assignment');
select pg_temp.assert((select package_id='00000000-0000-0000-0000-000000000012' and price_krw=120000 from albums),'author selection takes effect');
select pg_temp.reject($q$select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011')$q$);
update albums set package_id=null,price_krw=null;
select pg_temp.assert((select count(*)=0 from album_admin_packages),'clearing an author selection never resurrects an old internal assignment');

set local role authenticated;
set local qa.admin='true';
select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011');
select pg_temp.assert((select count(*)=1 from album_admin_packages),'admin can save and read internal assignment');
select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012');
select pg_temp.assert((select package_id='00000000-0000-0000-0000-000000000012' from album_admin_packages),'admin can change internal selection');
select set_album_admin_package('00000000-0000-0000-0000-000000000001',null);
select pg_temp.assert((select count(*)=0 from album_admin_packages),'admin can clear internal assignment');
reset role;
set local qa.admin='false';
set local role service_role;
select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011');
select pg_temp.assert((select count(*)=1 from album_admin_packages),'backfill service can save and read internal assignment');
reset role;
set local role anon;
select pg_temp.reject($q$select * from album_admin_packages$q$);
select pg_temp.reject($q$select set_album_admin_package('00000000-0000-0000-0000-000000000001',null)$q$);
reset role;
delete from packages where id='00000000-0000-0000-0000-000000000011';
select pg_temp.assert((select count(*)=0 from album_admin_packages),'deleted packages cannot leave stale internal assignments');
select set_album_admin_package('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012');
delete from albums;
select pg_temp.assert((select count(*)=0 from album_admin_packages),'deleted portfolios cascade internal assignment');
rollback;
