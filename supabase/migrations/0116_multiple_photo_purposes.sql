-- Ordered purpose sets: first entry remains the legacy primary purpose.
alter table public.albums add column admin_purposes text[] not null default '{}';
alter table public.photos add column admin_purposes text[] not null default '{}';
update public.albums set admin_purposes = array[admin_purpose] where admin_purpose is not null;
update public.photos set admin_purposes = array[admin_purpose] where admin_purpose is not null;

-- Run before existing guards. Check the caller's original values before syncing;
-- keep all existing metadata guards and RLS policies in place.
create function public.guard_and_sync_admin_purposes()
returns trigger language plpgsql set search_path = public as $$
declare
  v_field record;
  v_old jsonb;
  v_default jsonb;
begin
  -- SECURITY DEFINER changes current_user to the function owner. The session's
  -- selected role still identifies the caller, including nested legacy RPCs.
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;
    for v_field in select key, value from jsonb_each(to_jsonb(new))
      where key like 'admin_purpose%'
    loop
      v_default := case v_field.key
        when 'admin_purposes' then '[]'::jsonb
        when 'admin_purpose_reviewed' then 'false'::jsonb
        when 'admin_purpose_overridden' then 'false'::jsonb
        else 'null'::jsonb end;
      if v_field.value is distinct from
        (case when tg_op = 'UPDATE' then v_old -> v_field.key else v_default end) then
        raise exception 'Only administrators or service context may change photo purposes';
      end if;
    end loop;
  end if;

  if tg_op = 'INSERT' then
    if new.admin_purposes = '{}'::text[] and new.admin_purpose is not null then
      new.admin_purposes := array[new.admin_purpose];
    end if;
  elsif new.admin_purposes is not distinct from old.admin_purposes
    and new.admin_purpose is distinct from old.admin_purpose then
    -- Legacy automatic classification/backfill continues writing one purpose.
    new.admin_purposes := case when new.admin_purpose is null then '{}'::text[]
      else array[new.admin_purpose] end;
  end if;

  if new.admin_purposes is null
    or coalesce(array_ndims(new.admin_purposes),1) <> 1
    or cardinality(new.admin_purposes) > 7
    or exists (select 1 from unnest(new.admin_purposes) p where p is null or p not in
      ('personal','couple','friendship','wedding','pet','commercial','event')) then
    raise exception 'Invalid photo purpose set';
  end if;
  select coalesce(array_agg(p order by first_position), '{}'::text[])
    into new.admin_purposes
    from (select p, min(position) first_position
      from unnest(new.admin_purposes) with ordinality as entries(p,position)
      group by p) normalized;
  new.admin_purpose := new.admin_purposes[1];
  return new;
end;
$$;

create trigger trg_albums_admin_purpose_00_sync
before insert or update on public.albums
for each row execute function public.guard_and_sync_admin_purposes();
create trigger trg_photos_admin_purpose_00_sync
before insert or update on public.photos
for each row execute function public.guard_and_sync_admin_purposes();

alter table public.albums add constraint albums_admin_purposes_check check (
  cardinality(admin_purposes) <= 7
  and (cardinality(admin_purposes) = 0 or (array_ndims(admin_purposes)=1 and array_lower(admin_purposes,1)=1))
  and array_position(admin_purposes,null) is null
  and admin_purposes <@ array['personal','couple','friendship','wedding','pet','commercial','event']::text[]
  and admin_purpose is not distinct from admin_purposes[1]
);
alter table public.photos add constraint photos_admin_purposes_check check (
  cardinality(admin_purposes) <= 7
  and (cardinality(admin_purposes) = 0 or (array_ndims(admin_purposes)=1 and array_lower(admin_purposes,1)=1))
  and array_position(admin_purposes,null) is null
  and admin_purposes <@ array['personal','couple','friendship','wedding','pet','commercial','event']::text[]
  and admin_purpose is not distinct from admin_purposes[1]
);

create function public.set_album_admin_purposes(p_album_id uuid, p_purposes text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_purposes text[]; v_photo_count integer;
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may change album purposes';
  end if;
  if p_purposes is null or cardinality(p_purposes) not between 1 and 7 then
    raise exception 'Select between one and seven purposes';
  end if;
  -- Album row lock serializes bulk saves and exception resets.
  update public.albums set admin_purposes=p_purposes,
    admin_purpose_confidence=1, admin_purpose_source='manual',
    admin_purpose_reviewed=true, admin_purpose_version=null,
    admin_purpose_at=now(), admin_purpose_evidence=null
  where id=p_album_id returning admin_purposes into v_purposes;
  if not found then raise exception 'Album not found'; end if;
  update public.photos set admin_purposes=v_purposes,
    admin_purpose_confidence=1, admin_purpose_source='manual',
    admin_purpose_reviewed=true, admin_purpose_version=null,
    admin_purpose_at=now(), admin_purpose_evidence=null
  where album_id=p_album_id and not admin_purpose_overridden;
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

create function public.set_photo_admin_purposes(p_photo_id uuid, p_purposes text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may change photo purposes';
  end if;
  if p_purposes is null or cardinality(p_purposes) not between 1 and 7 then
    raise exception 'Select between one and seven purposes';
  end if;
  update public.photos set admin_purposes=p_purposes,
    admin_purpose_confidence=1, admin_purpose_source='manual',
    admin_purpose_reviewed=true, admin_purpose_version=null,
    admin_purpose_at=now(), admin_purpose_evidence=null, admin_purpose_overridden=true
  where id=p_photo_id;
  if not found then raise exception 'Photo not found'; end if;
end;
$$;

-- Explicit delegation handles selecting the same primary while dropping extras.
create or replace function public.set_album_admin_purpose(p_album_id uuid,p_purpose text)
returns integer language sql security definer set search_path = public as $$
  select public.set_album_admin_purposes(p_album_id,array[p_purpose]);
$$;
create or replace function public.set_photo_admin_purpose(p_photo_id uuid,p_purpose text)
returns void language sql security definer set search_path = public as $$
  select public.set_photo_admin_purposes(p_photo_id,array[p_purpose]);
$$;

create or replace function public.clear_photo_admin_purpose_override(p_photo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_album_id uuid; v_current_album_id uuid;
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may clear photo purpose overrides';
  end if;
  select album_id into v_album_id from public.photos where id=p_photo_id;
  if not found then raise exception 'Photo not found'; end if;
  -- Lock in bulk-save order (album then photo), then read fresh album values.
  perform 1 from public.albums where id=v_album_id for update;
  select album_id into v_current_album_id from public.photos where id=p_photo_id for update;
  if not found then raise exception 'Photo not found'; end if;
  if v_current_album_id is distinct from v_album_id then
    raise exception 'Photo album changed; retry the reset' using errcode='40001';
  end if;
  if v_album_id is null then
    update public.photos set admin_purposes='{}', admin_purpose=null,
      admin_purpose_confidence=null, admin_purpose_source=null,
      admin_purpose_reviewed=false, admin_purpose_version=null,
      admin_purpose_at=null, admin_purpose_evidence=null, admin_purpose_overridden=false
    where id=p_photo_id;
  else
    update public.photos p set admin_purposes=a.admin_purposes, admin_purpose=a.admin_purpose,
      admin_purpose_confidence=a.admin_purpose_confidence,
      admin_purpose_source=a.admin_purpose_source,
      admin_purpose_reviewed=a.admin_purpose_reviewed,
      admin_purpose_version=a.admin_purpose_version,
      admin_purpose_at=a.admin_purpose_at,
      admin_purpose_evidence=a.admin_purpose_evidence, admin_purpose_overridden=false
    from public.albums a where p.id=p_photo_id and a.id=v_album_id;
  end if;
end;
$$;

revoke all on function public.guard_and_sync_admin_purposes() from public, anon, authenticated;
revoke all on function public.set_album_admin_purposes(uuid,text[]) from public, anon;
revoke all on function public.set_photo_admin_purposes(uuid,text[]) from public, anon;
grant execute on function public.set_album_admin_purposes(uuid,text[]) to authenticated, service_role;
grant execute on function public.set_photo_admin_purposes(uuid,text[]) to authenticated, service_role;
