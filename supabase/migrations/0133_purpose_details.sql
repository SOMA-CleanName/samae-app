-- ════════════════════════════════════════════════════════════════
-- 0133 · 목적 세부분류 — 7개 목적 전부 (docs/39 §3, 2026-09-18 확정)
--
-- "임신" "만삭" "돌" 이 모두 행사 사진 25장을 똑같이 보여줬다. 목적이 7개로만 나뉘어 행사 안에
-- 만삭·돌잔치·졸업이 섞여 있었다. 세부분류를 저장해 검색이 좁힐 수 있게 한다.
--
-- 규칙은 성별(0132)과 같다.
--   · 값은 "목적.세부" (예: event.maternity). 그 목적이 있을 때만 가질 수 있고, 목적이 빠지면
--     트리거가 그 세부분류도 지운다. 한 목적 안에서 여러 개 가능(돌 + 가족)
--   · 포트폴리오 단위로 정하고 사진 한 장만 예외로 둘 수 있다
--   · 사람이 정한 값(manual)은 자동 초안(auto)이 덮어쓰지 않는다
--   · 비어 있으면 {} 가 아니라 null 이다 — 0116 보호 트리거는 관리자가 아닌 사람의 insert 에서
--     admin_purpose% 칸이 null 인지 본다. 기본값을 {} 로 두면 작가의 사진 올리기가 막힌다
--
-- 키 목록은 src/lib/purpose-details.json 과 같다. 키를 바꾸면 이 CHECK 도 새 마이그레이션으로 바꾼다.
--
-- 되돌리기:
--   drop function if exists public.set_album_admin_details(uuid, text[]);
--   drop function if exists public.set_photo_admin_details(uuid, text[]);
--   drop function if exists public.apply_album_details_draft(uuid, text[]);
--   drop trigger if exists trg_albums_admin_purpose_02_details on public.albums;
--   drop trigger if exists trg_photos_admin_purpose_02_details on public.photos;
--   drop function if exists public.keep_details_of_purposes();
--   drop function if exists public.purpose_detail_keys();
--   drop function if exists public.details_within_purposes(text[], text[]);   (CHECK 를 먼저 지운 뒤)
--   0132 의 clear_photo_admin_purpose_override · backfill_inherited_photo_purposes 를 다시 실행
--   alter table public.albums drop column admin_purpose_details, drop column admin_purpose_details_source;
--   alter table public.photos drop column admin_purpose_details, drop column admin_purpose_details_source;
-- ════════════════════════════════════════════════════════════════

-- 허용 키. CHECK·함수가 같이 쓴다.
create function public.purpose_detail_keys()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'personal.snap', 'personal.profile', 'personal.body_profile', 'personal.id_photo',
    'couple.snap', 'couple.anniversary', 'couple.travel', 'friendship.snap',
    'friendship.siblings', 'wedding.ceremony', 'wedding.shoot', 'wedding.remind',
    'pet.dog', 'pet.cat', 'pet.other', 'commercial.brand',
    'commercial.lookbook', 'commercial.product', 'commercial.business_profile', 'commercial.food_space',
    'event.maternity', 'event.baby', 'event.first_birthday', 'event.family',
    'event.graduation', 'event.group', 'event.banquet'
  ]::text[];
$$;

-- CHECK 에는 서브쿼리를 못 쓴다 — 세부분류마다 제 목적이 있는지를 함수로 본다.
create function public.details_within_purposes(p_details text[], p_purposes text[])
returns boolean language sql immutable set search_path = public as $$
  select coalesce(bool_and(split_part(d, '.', 1) = any(p_purposes)), true)
    from unnest(p_details) d;
$$;

alter table public.albums
  add column admin_purpose_details text[],
  add column admin_purpose_details_source text;
alter table public.photos
  add column admin_purpose_details text[],
  add column admin_purpose_details_source text;

-- 세부분류는 제 목적이 있을 때만 — split_part(키, '.', 1) 이 목적 키다.
alter table public.albums add constraint albums_admin_purpose_details_check check (
  (admin_purpose_details is null) = (admin_purpose_details_source is null)
  and (admin_purpose_details_source is null or admin_purpose_details_source in ('auto', 'manual'))
  and (admin_purpose_details is null or (
    cardinality(admin_purpose_details) between 1 and 30
    and array_position(admin_purpose_details, null) is null
    and admin_purpose_details <@ public.purpose_detail_keys()
    and public.details_within_purposes(admin_purpose_details, admin_purposes)
  ))
);
alter table public.photos add constraint photos_admin_purpose_details_check check (
  (admin_purpose_details is null) = (admin_purpose_details_source is null)
  and (admin_purpose_details_source is null or admin_purpose_details_source in ('auto', 'manual'))
  and (admin_purpose_details is null or (
    cardinality(admin_purpose_details) between 1 and 30
    and array_position(admin_purpose_details, null) is null
    and admin_purpose_details <@ public.purpose_detail_keys()
    and public.details_within_purposes(admin_purpose_details, admin_purposes)
  ))
);

-- 목적이 빠지면 그 목적의 세부분류를 지운다. 순서·중복도 정리하고, 남은 게 없으면 null.
-- 00_sync(목적 정리)·01_gender 뒤에 돈다.
create function public.keep_details_of_purposes()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.admin_purpose_details is not null then
    select array_agg(d order by first_position)
      into new.admin_purpose_details
      from (select d, min(position) first_position
              from unnest(new.admin_purpose_details) with ordinality as entries(d, position)
             where d is not null and split_part(d, '.', 1) = any(new.admin_purposes)
             group by d) kept;
    if new.admin_purpose_details is null then
      new.admin_purpose_details_source := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_albums_admin_purpose_02_details
before insert or update on public.albums
for each row execute function public.keep_details_of_purposes();
create trigger trg_photos_admin_purpose_02_details
before insert or update on public.photos
for each row execute function public.keep_details_of_purposes();

-- 관리자: 포트폴리오 전체(예외 사진 제외). 빈 배열이면 지운다.
create function public.set_album_admin_details(p_album_id uuid, p_details text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_details text[]; v_photo_count integer;
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may change purpose details';
  end if;
  if p_details is not null and not (p_details <@ public.purpose_detail_keys()) then
    raise exception 'Invalid purpose detail';
  end if;
  v_details := nullif(coalesce(p_details, '{}'), '{}');
  update public.albums
     set admin_purpose_details = v_details,
         admin_purpose_details_source = case when v_details is null then null else 'manual' end
   where id = p_album_id;
  if not found then raise exception 'Album not found'; end if;
  update public.photos
     set admin_purpose_details = v_details,
         admin_purpose_details_source = case when v_details is null then null else 'manual' end
   where album_id = p_album_id and not admin_purpose_overridden;
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 관리자: 사진 한 장 — 예외로 표시한다.
create function public.set_photo_admin_details(p_photo_id uuid, p_details text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_details text[];
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may change purpose details';
  end if;
  if p_details is not null and not (p_details <@ public.purpose_detail_keys()) then
    raise exception 'Invalid purpose detail';
  end if;
  v_details := nullif(coalesce(p_details, '{}'), '{}');
  update public.photos
     set admin_purpose_details = v_details,
         admin_purpose_details_source = case when v_details is null then null else 'manual' end,
         admin_purpose_overridden = true
   where id = p_photo_id;
  if not found then raise exception 'Photo not found'; end if;
end;
$$;

-- 자동 초안(서비스 전용). manual·예외 사진은 건드리지 않는다.
create function public.apply_album_details_draft(p_album_id uuid, p_details text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_album_count integer; v_photo_count integer;
begin
  if p_details is null or cardinality(p_details) = 0 or not (p_details <@ public.purpose_detail_keys()) then
    raise exception 'Invalid purpose detail draft';
  end if;
  update public.albums
     set admin_purpose_details = p_details, admin_purpose_details_source = 'auto'
   where id = p_album_id
     and admin_purpose_details_source is distinct from 'manual';
  get diagnostics v_album_count = row_count;
  if v_album_count = 0 then return 0; end if;
  update public.photos
     set admin_purpose_details = p_details, admin_purpose_details_source = 'auto'
   where album_id = p_album_id
     and not admin_purpose_overridden
     and admin_purpose_details_source is distinct from 'manual';
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 0132 그대로 + 세부분류도 포트폴리오 값으로 되돌린다.
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
      admin_purpose_at=null, admin_purpose_evidence=null, admin_purpose_overridden=false,
      admin_purpose_gender=null, admin_purpose_gender_source=null,
      admin_purpose_details=null, admin_purpose_details_source=null
    where id=p_photo_id;
  else
    update public.photos p set admin_purposes=a.admin_purposes, admin_purpose=a.admin_purpose,
      admin_purpose_confidence=a.admin_purpose_confidence,
      admin_purpose_source=a.admin_purpose_source,
      admin_purpose_reviewed=a.admin_purpose_reviewed,
      admin_purpose_version=a.admin_purpose_version,
      admin_purpose_at=a.admin_purpose_at,
      admin_purpose_evidence=a.admin_purpose_evidence, admin_purpose_overridden=false,
      admin_purpose_gender=a.admin_purpose_gender,
      admin_purpose_gender_source=a.admin_purpose_gender_source,
      admin_purpose_details=a.admin_purpose_details,
      admin_purpose_details_source=a.admin_purpose_details_source
    from public.albums a where p.id=p_photo_id and a.id=v_album_id;
  end if;
end;
$$;

-- 0132 그대로 + 새 사진이 포트폴리오의 세부분류도 물려받는다.
create or replace function public.backfill_inherited_photo_purposes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with locked_albums as materialized (
    select a.* from public.albums a
    where (a.admin_purpose_reviewed or a.admin_purpose_source = 'manual')
      and cardinality(a.admin_purposes) > 0
      and exists (
        select 1 from public.photos p where p.album_id = a.id
          and p.visibility = 'published' and p.admin_purposes = '{}'
          and p.admin_purpose_source is null and p.admin_purpose_at is null
          and not p.admin_purpose_reviewed and not p.admin_purpose_overridden
      )
    order by a.id for update
  )
  update public.photos p
     set admin_purposes = a.admin_purposes,
         admin_purpose = a.admin_purpose,
         admin_purpose_source = a.admin_purpose_source,
         admin_purpose_confidence = a.admin_purpose_confidence,
         admin_purpose_reviewed = a.admin_purpose_reviewed,
         admin_purpose_version = a.admin_purpose_version,
         admin_purpose_at = coalesce(a.admin_purpose_at, now()),
         admin_purpose_evidence = a.admin_purpose_evidence,
         admin_purpose_gender = a.admin_purpose_gender,
         admin_purpose_gender_source = a.admin_purpose_gender_source,
         admin_purpose_details = a.admin_purpose_details,
         admin_purpose_details_source = a.admin_purpose_details_source
    from locked_albums a
   where p.album_id = a.id and p.visibility = 'published'
     and p.admin_purposes = '{}' and p.admin_purpose_source is null
     and p.admin_purpose_at is null
     and not p.admin_purpose_reviewed and not p.admin_purpose_overridden;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.keep_details_of_purposes() from public, anon, authenticated;
revoke all on function public.set_album_admin_details(uuid, text[]) from public, anon;
revoke all on function public.set_photo_admin_details(uuid, text[]) from public, anon;
grant execute on function public.set_album_admin_details(uuid, text[]) to authenticated, service_role;
grant execute on function public.set_photo_admin_details(uuid, text[]) to authenticated, service_role;
revoke all on function public.apply_album_details_draft(uuid, text[]) from public, anon, authenticated;
grant execute on function public.apply_album_details_draft(uuid, text[]) to service_role;

comment on column public.albums.admin_purpose_details is
  '목적 세부분류 — "목적.세부" 배열, 그 목적이 있을 때만. 비면 null (docs/39 §3).';
comment on column public.photos.admin_purpose_details is
  '목적 세부분류 — 포트폴리오에서 물려받고, 예외 사진은 따로 (docs/39 §3).';
