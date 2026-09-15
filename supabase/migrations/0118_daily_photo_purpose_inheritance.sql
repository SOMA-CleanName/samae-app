-- 매일 목적 백필 전에, 검수한 앨범에 새로 추가된 공개 사진의 빈 목적만 상속한다.
-- 기존 사진 검수·예외·목적은 변경하지 않는다. 일반 작가 호출은 허용하지 않는다.
create function public.backfill_inherited_photo_purposes() returns integer
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
         admin_purpose_evidence = a.admin_purpose_evidence
    from locked_albums a
   where p.album_id = a.id and p.visibility = 'published'
     and p.admin_purposes = '{}' and p.admin_purpose_source is null
     and p.admin_purpose_at is null
     and not p.admin_purpose_reviewed and not p.admin_purpose_overridden;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.backfill_inherited_photo_purposes() from public, anon, authenticated;
grant execute on function public.backfill_inherited_photo_purposes() to service_role;

-- 연결 행을 지우면 assigned_at도 사라지므로 분류 입력 변경 시각을 앨범에 남긴다.
-- 작가의 실제 패키지 선택/검수 목적은 그대로 유지한다.
create function public.mark_purpose_input_after_admin_package_removal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.albums set updated_at = now()
   where id = old.album_id and package_id is null;
  return old;
end;
$$;
revoke all on function public.mark_purpose_input_after_admin_package_removal() from public, anon, authenticated;
create trigger trg_admin_package_removal_marks_purpose_input
  after delete on public.album_admin_packages
  for each row execute function public.mark_purpose_input_after_admin_package_removal();
