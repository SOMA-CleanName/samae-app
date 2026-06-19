-- 0045 · 분석 이벤트에 scroll(무한스크롤 뎁스) 타입 허용
-- 기존 type CHECK( pageview, click )에 scroll 추가. 익명 CHECK 이름이라 정의로 찾아 드롭.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.analytics_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%pageview%';
  if c is not null then execute format('alter table public.analytics_events drop constraint %I', c); end if;
end $$;

alter table public.analytics_events
  add constraint analytics_events_type_check check (type in ('pageview', 'click', 'scroll'));
