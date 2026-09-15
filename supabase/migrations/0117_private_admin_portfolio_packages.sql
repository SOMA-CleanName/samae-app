-- 작가의 실제 선택과 운영자 내부 지정을 분리한다.
-- albums.package_id / price_krw는 작가가 직접 저장한 값만 유지한다.
create table public.album_admin_packages (
  album_id uuid primary key references public.albums(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
create index idx_album_admin_packages_package on public.album_admin_packages(package_id);
alter table public.album_admin_packages enable row level security;
revoke all on public.album_admin_packages from public, anon, authenticated;
grant select on public.album_admin_packages to authenticated;
grant select, insert, update, delete on public.album_admin_packages to service_role;
create policy album_admin_packages_admin_read on public.album_admin_packages
  for select to authenticated using ((select public.is_admin()));

create function public.guard_album_admin_package() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_album public.albums%rowtype;
begin
  -- 작가 저장과 내부 지정이 동시에 들어와도 같은 앨범 잠금으로 순서를 보장한다.
  select * into v_album from public.albums where id = new.album_id for update;
  if not found then raise exception '포트폴리오를 찾을 수 없습니다.'; end if;
  if v_album.package_id is not null then
    raise exception '작가가 직접 지정한 패키지는 관리자 지정으로 변경할 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.packages where id = new.package_id and photographer_id = v_album.photographer_id
  ) then raise exception '해당 작가의 패키지만 연결할 수 있습니다.'; end if;
  return new;
end;
$$;
revoke all on function public.guard_album_admin_package() from public, anon, authenticated;
create trigger trg_album_admin_package_guard
  before insert or update on public.album_admin_packages
  for each row execute function public.guard_album_admin_package();

create function public.set_album_admin_package(p_album_id uuid, p_package_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_package_id uuid;
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
       not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception '운영자만 내부 패키지를 지정할 수 있습니다.';
  end if;
  select package_id into v_package_id from public.albums where id = p_album_id for update;
  if not found then raise exception '포트폴리오를 찾을 수 없습니다.'; end if;
  if v_package_id is not null then
    raise exception '작가가 직접 지정한 패키지는 관리자 지정으로 변경할 수 없습니다.';
  end if;
  if p_package_id is null then
    delete from public.album_admin_packages where album_id = p_album_id;
  else
    insert into public.album_admin_packages(album_id, package_id)
    values(p_album_id, p_package_id)
    on conflict(album_id) do update set package_id = excluded.package_id, assigned_at = now();
  end if;
end;
$$;
revoke all on function public.set_album_admin_package(uuid, uuid) from public, anon;
grant execute on function public.set_album_admin_package(uuid, uuid) to authenticated, service_role;

create function public.clear_admin_package_after_author_selection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.album_admin_packages where album_id = new.id;
  return new;
end;
$$;
revoke all on function public.clear_admin_package_after_author_selection() from public, anon, authenticated;
create trigger trg_albums_author_package_clears_admin
  after update of package_id, photographer_id on public.albums
  for each row when (
    new.package_id is not null
    or old.package_id is distinct from new.package_id
    or old.photographer_id is distinct from new.photographer_id
  ) execute function public.clear_admin_package_after_author_selection();

comment on table public.album_admin_packages is
  '운영자 내부 패키지 지정. 작가·고객에게 노출하지 않으며, 작가가 패키지를 지정하면 삭제된다.';
