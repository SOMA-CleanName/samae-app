-- 운영자 목적 검수. 목적·신뢰도·출처·기존 태그는 유지하고 검수 플래그만 바꾼다.

create or replace function public.review_album_admin_purpose(
  p_album_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_count integer;
begin
  if not public.is_service_context() and not public.is_admin() then
    raise exception '운영자만 앨범 목적을 검수할 수 있습니다';
  end if;

  if not exists (
    select 1 from public.albums
     where id = p_album_id
  ) then
    raise exception '앨범을 찾을 수 없습니다';
  end if;

  if exists (
    select 1 from public.albums
     where id = p_album_id
       and admin_purpose is null
  ) or exists (
    select 1 from public.photos
     where album_id = p_album_id
       and admin_purpose is null
  ) then
    raise exception '목적이 분류되지 않은 앨범이나 사진은 검수할 수 없습니다';
  end if;

  update public.albums
     set admin_purpose_reviewed = true
   where id = p_album_id;

  update public.photos
     set admin_purpose_reviewed = true
   where album_id = p_album_id;
  get diagnostics v_photo_count = row_count;

  return v_photo_count;
end;
$$;

create or replace function public.review_photo_admin_purpose(
  p_photo_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_context() and not public.is_admin() then
    raise exception '운영자만 사진 목적을 검수할 수 있습니다';
  end if;

  if not exists (
    select 1 from public.photos
     where id = p_photo_id
  ) then
    raise exception '사진을 찾을 수 없습니다';
  end if;

  update public.photos
     set admin_purpose_reviewed = true
   where id = p_photo_id
     and admin_purpose is not null;

  if not found then
    raise exception '목적이 분류되지 않은 사진은 검수할 수 없습니다';
  end if;
end;
$$;

revoke all on function public.review_album_admin_purpose(uuid) from public, anon;
grant execute on function public.review_album_admin_purpose(uuid) to authenticated, service_role;

revoke all on function public.review_photo_admin_purpose(uuid) from public, anon;
grant execute on function public.review_photo_admin_purpose(uuid) to authenticated, service_role;
