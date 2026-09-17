-- ════════════════════════════════════════════════════════════════
-- 0113 · 운영자 전용 사진 목적 분류
--
-- 기존 mood/generated/category 계열 필드와 분리된 전용 열만 사용한다.
-- 앨범 목적은 소속 사진에 물리적으로 복사하고, 사진별 수동 예외는
-- admin_purpose_overridden=true 로 보호한다.
-- ════════════════════════════════════════════════════════════════

alter table public.albums
  add column if not exists admin_purpose text,
  add column if not exists admin_purpose_confidence real,
  add column if not exists admin_purpose_source text,
  add column if not exists admin_purpose_reviewed boolean not null default false,
  add column if not exists admin_purpose_version text,
  add column if not exists admin_purpose_at timestamptz;

alter table public.photos
  add column if not exists admin_purpose text,
  add column if not exists admin_purpose_confidence real,
  add column if not exists admin_purpose_source text,
  add column if not exists admin_purpose_reviewed boolean not null default false,
  add column if not exists admin_purpose_version text,
  add column if not exists admin_purpose_at timestamptz,
  add column if not exists admin_purpose_overridden boolean not null default false;

alter table public.albums drop constraint if exists albums_admin_purpose_check;
alter table public.albums add constraint albums_admin_purpose_check
  check (admin_purpose is null or admin_purpose in (
    'personal', 'couple', 'friendship', 'wedding', 'pet', 'commercial', 'event'
  ));

alter table public.albums drop constraint if exists albums_admin_purpose_confidence_check;
alter table public.albums add constraint albums_admin_purpose_confidence_check
  check (admin_purpose_confidence is null or admin_purpose_confidence between 0 and 1);

alter table public.albums drop constraint if exists albums_admin_purpose_source_check;
alter table public.albums add constraint albums_admin_purpose_source_check
  check (admin_purpose_source is null or admin_purpose_source in ('siglip', 'manual'));

alter table public.photos drop constraint if exists photos_admin_purpose_check;
alter table public.photos add constraint photos_admin_purpose_check
  check (admin_purpose is null or admin_purpose in (
    'personal', 'couple', 'friendship', 'wedding', 'pet', 'commercial', 'event'
  ));

alter table public.photos drop constraint if exists photos_admin_purpose_confidence_check;
alter table public.photos add constraint photos_admin_purpose_confidence_check
  check (admin_purpose_confidence is null or admin_purpose_confidence between 0 and 1);

alter table public.photos drop constraint if exists photos_admin_purpose_source_check;
alter table public.photos add constraint photos_admin_purpose_source_check
  check (admin_purpose_source is null or admin_purpose_source in ('siglip', 'manual'));

create index if not exists idx_albums_admin_purpose_review
  on public.albums (admin_purpose_reviewed, admin_purpose);

create index if not exists idx_photos_admin_purpose_review
  on public.photos (admin_purpose_reviewed, admin_purpose);

-- photos/albums 의 일반 쓰기 정책은 작가 본인도 허용한다. 목적 필드는 운영자와
-- 서버만 바꿀 수 있도록 별도 가드한다.
create or replace function public.guard_album_admin_purpose()
returns trigger language plpgsql
set search_path = public as $$
begin
  if row(
    new.admin_purpose,
    new.admin_purpose_confidence,
    new.admin_purpose_source,
    new.admin_purpose_reviewed,
    new.admin_purpose_version,
    new.admin_purpose_at
  ) is distinct from row(
    old.admin_purpose,
    old.admin_purpose_confidence,
    old.admin_purpose_source,
    old.admin_purpose_reviewed,
    old.admin_purpose_version,
    old.admin_purpose_at
  ) and not public.is_service_context() and not public.is_admin() then
    raise exception '앨범 목적 변경 권한이 없습니다 (운영자/서버 전용)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_albums_admin_purpose_guard on public.albums;
create trigger trg_albums_admin_purpose_guard
  before update on public.albums
  for each row execute function public.guard_album_admin_purpose();

create or replace function public.guard_photo_admin_purpose()
returns trigger language plpgsql
set search_path = public as $$
begin
  if row(
    new.admin_purpose,
    new.admin_purpose_confidence,
    new.admin_purpose_source,
    new.admin_purpose_reviewed,
    new.admin_purpose_version,
    new.admin_purpose_at,
    new.admin_purpose_overridden
  ) is distinct from row(
    old.admin_purpose,
    old.admin_purpose_confidence,
    old.admin_purpose_source,
    old.admin_purpose_reviewed,
    old.admin_purpose_version,
    old.admin_purpose_at,
    old.admin_purpose_overridden
  ) and not public.is_service_context() and not public.is_admin() then
    raise exception '사진 목적 변경 권한이 없습니다 (운영자/서버 전용)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_photos_admin_purpose_guard on public.photos;
create trigger trg_photos_admin_purpose_guard
  before update on public.photos
  for each row execute function public.guard_photo_admin_purpose();

-- SigLIP 배치 전용. 앨범이 이미 검수/수동 처리됐으면 아무 것도 바꾸지 않는다.
create or replace function public.apply_siglip_album_purpose(
  p_album_id uuid,
  p_purpose text,
  p_confidence real,
  p_version text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album_count integer;
  v_photo_count integer;
begin
  if p_purpose is not null and p_purpose not in (
    'personal', 'couple', 'friendship', 'wedding', 'pet', 'commercial', 'event'
  ) then
    raise exception '허용되지 않은 목적 코드입니다: %', p_purpose;
  end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'confidence는 0 이상 1 이하여야 합니다';
  end if;
  if nullif(btrim(p_version), '') is null then
    raise exception '분류 버전은 비어 있을 수 없습니다';
  end if;

  update public.albums
     set admin_purpose = p_purpose,
         admin_purpose_confidence = p_confidence,
         admin_purpose_source = 'siglip',
         admin_purpose_reviewed = false,
         admin_purpose_version = p_version,
         admin_purpose_at = now()
   where id = p_album_id
     and not admin_purpose_reviewed
     and admin_purpose_source is distinct from 'manual';
  get diagnostics v_album_count = row_count;

  if v_album_count = 0 then
    return 0;
  end if;

  update public.photos
     set admin_purpose = p_purpose,
         admin_purpose_confidence = p_confidence,
         admin_purpose_source = 'siglip',
         admin_purpose_reviewed = false,
         admin_purpose_version = p_version,
         admin_purpose_at = now()
   where album_id = p_album_id
     and not admin_purpose_overridden
     and not admin_purpose_reviewed
     and admin_purpose_source is distinct from 'manual';
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 운영자가 앨범 목적을 확정하면 예외 처리되지 않은 모든 사진에 일괄 적용한다.
create or replace function public.set_album_admin_purpose(
  p_album_id uuid,
  p_purpose text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album_count integer;
  v_photo_count integer;
begin
  if not public.is_service_context() and not public.is_admin() then
    raise exception '운영자만 앨범 목적을 변경할 수 있습니다';
  end if;
  if p_purpose is null or p_purpose not in (
    'personal', 'couple', 'friendship', 'wedding', 'pet', 'commercial', 'event'
  ) then
    raise exception '허용되지 않은 목적 코드입니다: %', p_purpose;
  end if;

  update public.albums
     set admin_purpose = p_purpose,
         admin_purpose_confidence = 1,
         admin_purpose_source = 'manual',
         admin_purpose_reviewed = true,
         admin_purpose_version = null,
         admin_purpose_at = now()
   where id = p_album_id;
  get diagnostics v_album_count = row_count;

  if v_album_count = 0 then
    raise exception '앨범을 찾을 수 없습니다';
  end if;

  update public.photos
     set admin_purpose = p_purpose,
         admin_purpose_confidence = 1,
         admin_purpose_source = 'manual',
         admin_purpose_reviewed = true,
         admin_purpose_version = null,
         admin_purpose_at = now()
   where album_id = p_album_id
     and not admin_purpose_overridden;
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 사진 한 장만 앨범과 다른 목적으로 확정한다.
create or replace function public.set_photo_admin_purpose(
  p_photo_id uuid,
  p_purpose text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_context() and not public.is_admin() then
    raise exception '운영자만 사진 목적을 변경할 수 있습니다';
  end if;
  if p_purpose is null or p_purpose not in (
    'personal', 'couple', 'friendship', 'wedding', 'pet', 'commercial', 'event'
  ) then
    raise exception '허용되지 않은 목적 코드입니다: %', p_purpose;
  end if;

  update public.photos
     set admin_purpose = p_purpose,
         admin_purpose_confidence = 1,
         admin_purpose_source = 'manual',
         admin_purpose_reviewed = true,
         admin_purpose_version = null,
         admin_purpose_at = now(),
         admin_purpose_overridden = true
   where id = p_photo_id;

  if not found then
    raise exception '사진을 찾을 수 없습니다';
  end if;
end;
$$;

-- 사진 예외를 해제하고 현재 앨범 값을 다시 복사한다.
create or replace function public.clear_photo_admin_purpose_override(
  p_photo_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album_id uuid;
begin
  if not public.is_service_context() and not public.is_admin() then
    raise exception '운영자만 사진 목적 예외를 해제할 수 있습니다';
  end if;

  select album_id into v_album_id
    from public.photos
   where id = p_photo_id;

  if not found then
    raise exception '사진을 찾을 수 없습니다';
  end if;

  if v_album_id is null then
    update public.photos
       set admin_purpose = null,
           admin_purpose_confidence = null,
           admin_purpose_source = null,
           admin_purpose_reviewed = false,
           admin_purpose_version = null,
           admin_purpose_at = null,
           admin_purpose_overridden = false
     where id = p_photo_id;
    return;
  end if;

  update public.photos p
     set admin_purpose = a.admin_purpose,
         admin_purpose_confidence = a.admin_purpose_confidence,
         admin_purpose_source = a.admin_purpose_source,
         admin_purpose_reviewed = a.admin_purpose_reviewed,
         admin_purpose_version = a.admin_purpose_version,
         admin_purpose_at = a.admin_purpose_at,
         admin_purpose_overridden = false
    from public.albums a
   where p.id = p_photo_id
     and p.album_id = a.id;

end;
$$;

revoke all on function public.apply_siglip_album_purpose(uuid, text, real, text) from public, anon, authenticated;
grant execute on function public.apply_siglip_album_purpose(uuid, text, real, text) to service_role;

revoke all on function public.set_album_admin_purpose(uuid, text) from public, anon;
grant execute on function public.set_album_admin_purpose(uuid, text) to authenticated, service_role;

revoke all on function public.set_photo_admin_purpose(uuid, text) from public, anon;
grant execute on function public.set_photo_admin_purpose(uuid, text) to authenticated, service_role;

revoke all on function public.clear_photo_admin_purpose_override(uuid) from public, anon;
grant execute on function public.clear_photo_admin_purpose_override(uuid) to authenticated, service_role;
