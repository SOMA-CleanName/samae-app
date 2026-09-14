-- ════════════════════════════════════════════════════════════════
-- 0115 · 텍스트 우선 사진 목적 분류
--
-- 포트폴리오를 실제 패키지와 연결하고, 사진별 선택 텍스트와 자동 분류
-- 근거를 저장한다. 기존 무드/생성 태그/카테고리 값은 변경하지 않는다.
-- ════════════════════════════════════════════════════════════════

alter table public.albums
  add column if not exists package_id uuid references public.packages(id) on delete set null,
  add column if not exists admin_purpose_evidence jsonb;

alter table public.photos
  add column if not exists title text,
  add column if not exists caption text,
  add column if not exists admin_purpose_evidence jsonb;

create index if not exists idx_albums_package_id on public.albums (package_id);

alter table public.albums drop constraint if exists albums_admin_purpose_source_check;
alter table public.albums add constraint albums_admin_purpose_source_check
  check (admin_purpose_source is null or admin_purpose_source in (
    'siglip', 'text', 'hybrid', 'manual'
  ));

alter table public.photos drop constraint if exists photos_admin_purpose_source_check;
alter table public.photos add constraint photos_admin_purpose_source_check
  check (admin_purpose_source is null or admin_purpose_source in (
    'siglip', 'text', 'hybrid', 'manual'
  ));

alter table public.photos drop constraint if exists photos_title_length_check;
alter table public.photos add constraint photos_title_length_check
  check (title is null or char_length(title) <= 120);

alter table public.photos drop constraint if exists photos_caption_length_check;
alter table public.photos add constraint photos_caption_length_check
  check (caption is null or char_length(caption) <= 1000);

-- 포트폴리오에는 같은 작가가 소유한 패키지만 연결할 수 있다.
create or replace function public.guard_album_package_owner()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.package_id is not null and not exists (
    select 1
      from public.packages p
     where p.id = new.package_id
       and p.photographer_id = new.photographer_id
  ) then
    raise exception '다른 작가의 패키지는 포트폴리오에 연결할 수 없습니다';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_albums_package_owner_guard on public.albums;
create trigger trg_albums_package_owner_guard
  before insert or update of package_id, photographer_id on public.albums
  for each row execute function public.guard_album_package_owner();

-- 자동 분류 근거 역시 목적 전용 운영 데이터이므로 기존 가드에 포함한다.
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
    new.admin_purpose_at,
    new.admin_purpose_evidence
  ) is distinct from row(
    old.admin_purpose,
    old.admin_purpose_confidence,
    old.admin_purpose_source,
    old.admin_purpose_reviewed,
    old.admin_purpose_version,
    old.admin_purpose_at,
    old.admin_purpose_evidence
  ) and not public.is_service_context() and not public.is_admin() then
    raise exception '앨범 목적 변경 권한이 없습니다 (운영자/서버 전용)';
  end if;
  return new;
end;
$$;

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
    new.admin_purpose_overridden,
    new.admin_purpose_evidence
  ) is distinct from row(
    old.admin_purpose,
    old.admin_purpose_confidence,
    old.admin_purpose_source,
    old.admin_purpose_reviewed,
    old.admin_purpose_version,
    old.admin_purpose_at,
    old.admin_purpose_overridden,
    old.admin_purpose_evidence
  ) and not public.is_service_context() and not public.is_admin() then
    raise exception '사진 목적 변경 권한이 없습니다 (운영자/서버 전용)';
  end if;
  return new;
end;
$$;

-- 텍스트/SigLIP/혼합 자동 분류를 앨범과 비예외 사진에 원자 적용한다.
create or replace function public.apply_album_purpose_classification(
  p_album_id uuid,
  p_purpose text,
  p_confidence real,
  p_source text,
  p_version text,
  p_evidence jsonb default null
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
  if p_source not in ('siglip', 'text', 'hybrid') then
    raise exception '허용되지 않은 자동 분류 출처입니다: %', p_source;
  end if;
  if nullif(btrim(p_version), '') is null then
    raise exception '분류 버전은 비어 있을 수 없습니다';
  end if;

  update public.albums
     set admin_purpose = p_purpose,
         admin_purpose_confidence = p_confidence,
         admin_purpose_source = p_source,
         admin_purpose_reviewed = false,
         admin_purpose_version = p_version,
         admin_purpose_at = now(),
         admin_purpose_evidence = p_evidence
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
         admin_purpose_source = p_source,
         admin_purpose_reviewed = false,
         admin_purpose_version = p_version,
         admin_purpose_at = now(),
         admin_purpose_evidence = p_evidence
   where album_id = p_album_id
     and not admin_purpose_overridden
     and not admin_purpose_reviewed
     and admin_purpose_source is distinct from 'manual';
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 수동 확정 시 과거 자동 판정 근거를 지운다.
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
         admin_purpose_at = now(),
         admin_purpose_evidence = null
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
         admin_purpose_at = now(),
         admin_purpose_evidence = null
   where album_id = p_album_id
     and not admin_purpose_overridden;
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

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
         admin_purpose_overridden = true,
         admin_purpose_evidence = null
   where id = p_photo_id;

  if not found then
    raise exception '사진을 찾을 수 없습니다';
  end if;
end;
$$;

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

  select album_id into v_album_id from public.photos where id = p_photo_id;
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
           admin_purpose_overridden = false,
           admin_purpose_evidence = null
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
         admin_purpose_overridden = false,
         admin_purpose_evidence = a.admin_purpose_evidence
    from public.albums a
   where p.id = p_photo_id
     and p.album_id = a.id;
end;
$$;

revoke all on function public.apply_album_purpose_classification(uuid, text, real, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_album_purpose_classification(uuid, text, real, text, text, jsonb)
  to service_role;
