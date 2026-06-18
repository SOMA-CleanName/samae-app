-- 0044 · 문의 연락처 CHECK 에 extra_contact 포함 (기타 연락처만 입력해도 저장되게)
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.inquiries'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%instagram_id%';
  if c is not null then execute format('alter table public.inquiries drop constraint %I', c); end if;
end $$;

alter table public.inquiries
  add constraint inquiries_contact_check check (
    phone is not null
    or instagram_id is not null
    or discord_id is not null
    or contact_email is not null
    or extra_contact is not null
  );
