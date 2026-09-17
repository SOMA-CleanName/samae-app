\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database()<>'samae_mood_qa' or exists(select 1 from pg_tables where schemaname='public') then
    raise exception 'Only empty isolated samae_mood_qa allowed';
  end if;
end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.photos(id uuid primary key);
\ir ../migrations/0119_mood_vocabulary_research.sql
\ir ../migrations/0120_mood_lexical_classification.sql
set local role service_role;
insert into mood_candidates(id,label,axis,selection_status) values
 ('seed','따뜻한 분위기','온도','shortlisted'),('raw','기쁨','unassigned','collected'),
 ('general','강아지','unassigned','collected'),('pending','모호한 말','unassigned','collected');
insert into mood_candidate_classifications(candidate_id,kind,axis,version,rule,evidence) values
 ('seed','mood','감정','v1','test','{}'),('raw','mood','감정','v1','test','{}'),
 ('general','general',null,'v1','test','{}'),('pending','pending',null,'v1','test','{}');
do $$ begin
  if (select browsing_axis from mood_catalog where id='seed')<>'온도' then raise exception 'Editorial override lost'; end if;
  if (select browsing_axis from mood_catalog where id='raw')<>'감정' then raise exception 'Raw axis not grouped'; end if;
  if (select axis from mood_candidates where id='raw')<>'unassigned' then raise exception 'Original changed'; end if;
  if (select count(*) from mood_candidates where selection_status='shortlisted')<>1 then raise exception 'Candidates promoted'; end if;
  if (select browsing_axis from mood_catalog where id='general')<>'general' then raise exception 'General group lost'; end if;
  if (select browsing_axis from mood_catalog where id='pending')<>'unassigned' then raise exception 'Pending group lost'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform * from mood_catalog;
  exception when insufficient_privilege then return; end;
  raise exception 'Research view exposed';
end $$;
reset role;
rollback;
