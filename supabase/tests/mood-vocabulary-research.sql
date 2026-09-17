\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database()<>'samae_mood_qa' or exists(select 1 from pg_tables where schemaname='public') then
    raise exception 'Only empty isolated samae_mood_qa database allowed';
  end if;
end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.photos(id uuid primary key);
\ir ../migrations/0119_mood_vocabulary_research.sql
set local role service_role;
insert into public.mood_sources(id,url,revision,license_status,attribution) values('s','test','v1','test','test');
insert into public.mood_candidates(id,label,axis) values('c','포근한','온도');
insert into public.mood_candidates(id,label,axis) values('c','포근한','온도') on conflict(id) do nothing;
insert into public.mood_candidate_sources(source_id,entry_key,candidate_id) values('s','1','c');
do $$ begin
  if (select count(*) from public.mood_candidates)<>1 then raise exception 'Duplicate candidate'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform * from public.mood_candidates;
  exception when insufficient_privilege then return; end;
  raise exception 'Research must not be public';
end $$;
reset role;
do $$ begin
  if (select count(*) from public.photos)<>0 then raise exception 'Photos changed'; end if;
  if has_table_privilege('anon','public.mood_candidates','select') then raise exception 'Anonymous access'; end if;
end $$;
rollback;
