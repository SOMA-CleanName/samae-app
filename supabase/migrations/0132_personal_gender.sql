-- ════════════════════════════════════════════════════════════════
-- 0132 · 개인 목적 안의 성별 — 여성 / 남성
--
-- "여자" 로 검색하면 개인 사진 1,027장 중 약 1,000장이 여성인데 282장만 나왔고, "남자" 는
-- 106장 중 남자가 약 24장이었다(docs/29 §12.9). 성별은 검색 점수로 가를 수 없어서 사진의
-- 속성으로 저장한다. **개인 목적에만 붙는다** — 커플·웨딩 사진에는 두 성별이 다 있다.
--
-- 목적과 같은 규칙을 따른다(docs/39).
--   · 포트폴리오(앨범) 단위로 정하고, 필요하면 사진 한 장만 예외로 둔다(admin_purpose_overridden)
--   · 사람이 정한 값(manual)은 자동 초안(auto)이 덮어쓰지 않는다
--   · 칸 이름을 admin_purpose_ 로 시작하게 지어, 0116 의 보호 트리거가 그대로 막는다 —
--     관리자·서비스 말고는 바꿀 수 없다
--
-- 되돌리기:
--   drop function if exists public.set_album_admin_gender(uuid, text);
--   drop function if exists public.set_photo_admin_gender(uuid, text);
--   drop function if exists public.apply_album_gender_draft(uuid, text);
--   drop trigger if exists trg_albums_admin_purpose_01_gender on public.albums;
--   drop trigger if exists trg_photos_admin_purpose_01_gender on public.photos;
--   drop function if exists public.clear_gender_without_personal();
--   0116 의 clear_photo_admin_purpose_override · 0118 의 backfill_inherited_photo_purposes 를 다시 실행
--   alter table public.albums drop column admin_purpose_gender, drop column admin_purpose_gender_source;
--   alter table public.photos drop column admin_purpose_gender, drop column admin_purpose_gender_source;
-- ════════════════════════════════════════════════════════════════

alter table public.albums
  add column admin_purpose_gender text,
  add column admin_purpose_gender_source text;
alter table public.photos
  add column admin_purpose_gender text,
  add column admin_purpose_gender_source text;

alter table public.albums add constraint albums_admin_purpose_gender_check check (
  (admin_purpose_gender is null) = (admin_purpose_gender_source is null)
  and (admin_purpose_gender is null or admin_purpose_gender in ('female', 'male'))
  and (admin_purpose_gender_source is null or admin_purpose_gender_source in ('auto', 'manual'))
  and (admin_purpose_gender is null or 'personal' = any(admin_purposes))
);
alter table public.photos add constraint photos_admin_purpose_gender_check check (
  (admin_purpose_gender is null) = (admin_purpose_gender_source is null)
  and (admin_purpose_gender is null or admin_purpose_gender in ('female', 'male'))
  and (admin_purpose_gender_source is null or admin_purpose_gender_source in ('auto', 'manual'))
  and (admin_purpose_gender is null or 'personal' = any(admin_purposes))
);

-- 개인이 빠지면 성별도 지운다. 자동 분류가 목적을 바꾸거나 관리자가 개인을 끌 때 — 목적을 저장하는
-- 모든 길이 여길 지나므로 각 함수에서 따로 챙기지 않아도 된다. 00_sync 가 목적을 정리한 뒤에 돈다
-- (같은 시점의 트리거는 이름순).
create function public.clear_gender_without_personal()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.admin_purpose_gender is not null and not ('personal' = any(new.admin_purposes)) then
    new.admin_purpose_gender := null;
    new.admin_purpose_gender_source := null;
  end if;
  return new;
end;
$$;

create trigger trg_albums_admin_purpose_01_gender
before insert or update on public.albums
for each row execute function public.clear_gender_without_personal();
create trigger trg_photos_admin_purpose_01_gender
before insert or update on public.photos
for each row execute function public.clear_gender_without_personal();

-- 관리자: 포트폴리오 전체. 예외 사진은 건드리지 않는다(목적 저장과 같다). null 이면 지운다.
create function public.set_album_admin_gender(p_album_id uuid, p_gender text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_photo_count integer;
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may change album gender';
  end if;
  if p_gender is not null and p_gender not in ('female', 'male') then
    raise exception 'Invalid gender: %', p_gender;
  end if;
  update public.albums
     set admin_purpose_gender = p_gender,
         admin_purpose_gender_source = case when p_gender is null then null else 'manual' end
   where id = p_album_id
     and (p_gender is null or 'personal' = any(admin_purposes));
  if not found then
    raise exception 'Album not found or not a personal shoot';
  end if;
  update public.photos
     set admin_purpose_gender = p_gender,
         admin_purpose_gender_source = case when p_gender is null then null else 'manual' end
   where album_id = p_album_id
     and not admin_purpose_overridden
     and 'personal' = any(admin_purposes);
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 관리자: 사진 한 장만. 예외로 표시해 포트폴리오 저장이 덮어쓰지 않게 한다(목적 개별 적용과 같다).
create function public.set_photo_admin_gender(p_photo_id uuid, p_gender text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
    not in ('service_role', 'postgres', 'supabase_admin') and not public.is_admin() then
    raise exception 'Only administrators may change photo gender';
  end if;
  if p_gender is not null and p_gender not in ('female', 'male') then
    raise exception 'Invalid gender: %', p_gender;
  end if;
  update public.photos
     set admin_purpose_gender = p_gender,
         admin_purpose_gender_source = case when p_gender is null then null else 'manual' end,
         admin_purpose_overridden = true
   where id = p_photo_id
     and (p_gender is null or 'personal' = any(admin_purposes));
  if not found then
    raise exception 'Photo not found or not a personal shoot';
  end if;
end;
$$;

-- 자동 초안(서비스 전용). 사람이 정한 성별·예외 사진은 건드리지 않는다. 초안은 auto 로 남아 검수 대상이다.
create function public.apply_album_gender_draft(p_album_id uuid, p_gender text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_album_count integer; v_photo_count integer;
begin
  if p_gender not in ('female', 'male') then
    raise exception 'Invalid gender: %', p_gender;
  end if;
  update public.albums
     set admin_purpose_gender = p_gender, admin_purpose_gender_source = 'auto'
   where id = p_album_id
     and 'personal' = any(admin_purposes)
     and admin_purpose_gender_source is distinct from 'manual';
  get diagnostics v_album_count = row_count;
  if v_album_count = 0 then
    return 0;
  end if;
  update public.photos
     set admin_purpose_gender = p_gender, admin_purpose_gender_source = 'auto'
   where album_id = p_album_id
     and not admin_purpose_overridden
     and 'personal' = any(admin_purposes)
     and admin_purpose_gender_source is distinct from 'manual';
  get diagnostics v_photo_count = row_count;
  return v_photo_count;
end;
$$;

-- 0116 그대로 + 성별도 포트폴리오 값으로 되돌린다.
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
      admin_purpose_gender=null, admin_purpose_gender_source=null
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
      admin_purpose_gender_source=a.admin_purpose_gender_source
    from public.albums a where p.id=p_photo_id and a.id=v_album_id;
  end if;
end;
$$;

-- 0118 그대로 + 새 사진이 포트폴리오의 성별도 물려받는다.
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
         admin_purpose_gender_source = a.admin_purpose_gender_source
    from locked_albums a
   where p.album_id = a.id and p.visibility = 'published'
     and p.admin_purposes = '{}' and p.admin_purpose_source is null
     and p.admin_purpose_at is null
     and not p.admin_purpose_reviewed and not p.admin_purpose_overridden;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.clear_gender_without_personal() from public, anon, authenticated;
revoke all on function public.set_album_admin_gender(uuid, text) from public, anon;
revoke all on function public.set_photo_admin_gender(uuid, text) from public, anon;
grant execute on function public.set_album_admin_gender(uuid, text) to authenticated, service_role;
grant execute on function public.set_photo_admin_gender(uuid, text) to authenticated, service_role;
revoke all on function public.apply_album_gender_draft(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_album_gender_draft(uuid, text) to service_role;

comment on column public.albums.admin_purpose_gender is
  '개인 목적일 때만 — female / male. 다른 목적에는 없다(docs/39 §3.2).';
comment on column public.photos.admin_purpose_gender is
  '개인 목적일 때만 — female / male. 포트폴리오에서 물려받고, 예외 사진은 따로(docs/39 §3.2).';
