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
create function public.is_admin() returns boolean language sql stable as
$$ select coalesce(current_setting('qa.admin',true),'false')='true' $$;
create function public.is_service_context() returns boolean language sql stable as
$$ select current_user in ('service_role', 'postgres', 'supabase_admin')
  or coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role' $$;
create table public.packages(id uuid primary key, photographer_id uuid);
create table public.albums(id uuid primary key, photographer_id uuid);
create table public.photos(id uuid primary key, album_id uuid references public.albums);
\ir ../migrations/0113_photo_purpose_classification.sql
\ir ../migrations/0114_photo_purpose_review.sql
\ir ../migrations/0115_photo_purpose_text_first.sql
insert into albums(id,admin_purpose,admin_purpose_source,admin_purpose_evidence)
values ('00000000-0000-0000-0000-000000000001','wedding','text','{"old":true}');
insert into photos(id,album_id,admin_purpose,admin_purpose_source,admin_purpose_evidence)
values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','wedding','text','{"old":true}'),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001',null,null,null),
('00000000-0000-0000-0000-000000000013',null,null,null,null);
\ir ../migrations/0116_multiple_photo_purposes.sql
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as
$$ begin if ok is distinct from true then raise exception 'Assertion failed: %', message; end if; end $$;
create function pg_temp.reject(statement text) returns void language plpgsql as
$$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'Expected rejection: %', statement;
end $$;
select pg_temp.assert((select admin_purposes=array['wedding'] and admin_purpose_evidence='{"old":true}'::jsonb from albums),'backfill preserves metadata');
select pg_temp.assert((select admin_purposes=array['wedding'] from photos where id::text like '%011'),'photo backfill');
select set_photo_admin_purposes('00000000-0000-0000-0000-000000000012',array['personal','pet']);
select pg_temp.assert(set_album_admin_purposes('00000000-0000-0000-0000-000000000001',array['wedding','pet','wedding'])=1,'album update excludes override');
select pg_temp.assert((select admin_purposes=array['wedding','pet'] and admin_purpose='wedding' and admin_purpose_evidence is null and admin_purpose_reviewed from albums),'dedupe, primary, manual metadata');
select pg_temp.assert((select admin_purposes=array['wedding','pet'] and admin_purpose_evidence is null from photos where id::text like '%011'),'full album inheritance');
select pg_temp.assert((select admin_purposes=array['personal','pet'] and admin_purpose_overridden from photos where id::text like '%012'),'override protected');
select pg_temp.assert(apply_album_purpose_classification('00000000-0000-0000-0000-000000000001','event',0.9,'text','v1','{}')=0,'manual album protected');
select pg_temp.assert(apply_siglip_album_purpose('00000000-0000-0000-0000-000000000001','event',0.9,'v1')=0,'legacy auto manual protection');
select clear_photo_admin_purpose_override('00000000-0000-0000-0000-000000000012');
select pg_temp.assert((select admin_purposes=array['wedding','pet'] and not admin_purpose_overridden from photos where id::text like '%012'),'reset full inheritance');
select set_photo_admin_purpose('00000000-0000-0000-0000-000000000012','wedding');
select pg_temp.assert((select admin_purposes=array['wedding'] from photos where id::text like '%012'),'legacy same primary collapses extras');
select set_album_admin_purpose('00000000-0000-0000-0000-000000000001','wedding');
select pg_temp.assert((select admin_purposes=array['wedding'] from albums),'legacy album same primary collapses extras');
select set_photo_admin_purposes('00000000-0000-0000-0000-000000000013',array['pet','event']);
select clear_photo_admin_purpose_override('00000000-0000-0000-0000-000000000013');
select pg_temp.assert((select admin_purposes='{}' and admin_purpose is null and admin_purpose_source is null and not admin_purpose_overridden from photos where id::text like '%013'),'standalone reset');
select pg_temp.reject($q$select set_album_admin_purposes('00000000-0000-0000-0000-000000000001','{}')$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',array['bad'])$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',array['pet',null])$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',null)$q$);
select pg_temp.reject($q$select set_album_admin_purposes('00000000-0000-0000-0000-000000000099',array['pet'])$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000099',array['pet'])$q$);
select pg_temp.reject($q$select clear_photo_admin_purpose_override('00000000-0000-0000-0000-000000000099')$q$);
select pg_temp.reject($q$select set_album_admin_purposes('00000000-0000-0000-0000-000000000001',array['bad'])$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',array[['pet','event']])$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',array['pet','pet','pet','pet','pet','pet','pet','pet'])$q$);
select set_photo_admin_purposes('00000000-0000-0000-0000-000000000013',array['event','pet','wedding','personal','friendship','couple','commercial']);
select pg_temp.assert((select cardinality(admin_purposes)=7 and admin_purpose='event' from photos where id::text like '%013'),'all seven purposes accepted');
select clear_photo_admin_purpose_override('00000000-0000-0000-0000-000000000013');
update albums set admin_purpose_source='text';
select pg_temp.assert(apply_album_purpose_classification('00000000-0000-0000-0000-000000000001','event',0.9,'text','v1','{}')=0,'reviewed nonmanual album protected');
update albums set admin_purpose_reviewed=false,admin_purpose_source='text';
update photos set admin_purpose_reviewed=false,admin_purpose_source='text' where id::text like '%011';
select pg_temp.assert(apply_album_purpose_classification('00000000-0000-0000-0000-000000000001','event',0.9,'text','v2','{}')=1,'auto skips overridden');
select pg_temp.assert((select admin_purposes=array['event'] from albums),'auto scalar sync album');
select pg_temp.assert((select admin_purposes=array['event'] from photos where id::text like '%011'),'auto scalar sync photo');
select apply_siglip_album_purpose('00000000-0000-0000-0000-000000000001',null,0.2,'v3');
select pg_temp.assert((select admin_purposes='{}' and admin_purpose is null from albums),'legacy auto unclassified sync');
insert into photos(id,admin_purpose) values ('00000000-0000-0000-0000-000000000014','pet');
select pg_temp.assert((select admin_purposes=array['pet'] from photos where id::text like '%014'),'legacy scalar insert sync');
insert into photos(id,admin_purposes) values ('00000000-0000-0000-0000-000000000015',array['wedding','pet']);
select pg_temp.assert((select admin_purpose='wedding' from photos where id::text like '%015'),'array insert sync');
grant select,insert,update on albums,photos to authenticated;
set local role authenticated;
select pg_temp.reject($q$update albums set admin_purposes=array['pet']$q$);
select pg_temp.reject($q$update photos set admin_purposes=array['pet']$q$);
select pg_temp.reject($q$insert into albums(id,admin_purposes) values ('00000000-0000-0000-0000-000000000099',array['pet'])$q$);
select pg_temp.reject($q$insert into photos(id,admin_purposes) values ('00000000-0000-0000-0000-000000000099',array['pet'])$q$);
select pg_temp.reject($q$insert into albums(id,admin_purpose) values ('00000000-0000-0000-0000-000000000099','pet')$q$);
select pg_temp.reject($q$insert into photos(id,admin_purpose_evidence) values ('00000000-0000-0000-0000-000000000099','{}')$q$);
select pg_temp.reject($q$update photos set admin_purpose_evidence='{}'$q$);
select pg_temp.reject($q$update albums set admin_purpose_reviewed=true$q$);
select pg_temp.reject($q$select set_album_admin_purposes('00000000-0000-0000-0000-000000000001',array['pet'])$q$);
select pg_temp.reject($q$select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',array['pet'])$q$);
select pg_temp.reject($q$select set_photo_admin_purpose('00000000-0000-0000-0000-000000000011','pet')$q$);
select pg_temp.reject($q$select clear_photo_admin_purpose_override('00000000-0000-0000-0000-000000000011')$q$);
insert into photos(id) values ('00000000-0000-0000-0000-000000000099');
set local qa.admin='true';
select set_album_admin_purposes('00000000-0000-0000-0000-000000000001',array['wedding','pet']);
set local qa.admin='false';
reset role;
set local role service_role;
select set_photo_admin_purposes('00000000-0000-0000-0000-000000000011',array['wedding','pet']);
select clear_photo_admin_purpose_override('00000000-0000-0000-0000-000000000011');
reset role;
select pg_temp.assert(not has_function_privilege('anon','public.set_album_admin_purposes(uuid,text[])','execute'),'anon denied album RPC');
select pg_temp.assert(not has_function_privilege('anon','public.set_photo_admin_purposes(uuid,text[])','execute'),'anon denied photo RPC');
select pg_temp.assert(not has_function_privilege('authenticated','public.apply_album_purpose_classification(uuid,text,real,text,text,jsonb)','execute'),'automatic service-only ACL preserved');
select pg_temp.assert(not has_function_privilege('authenticated','public.apply_siglip_album_purpose(uuid,text,real,text)','execute'),'legacy automatic service-only ACL preserved');
rollback;
\echo 'Multiple photo purposes SQL integration tests passed (fixture rolled back).'
