-- ════════════════════════════════════════════════════════════════
-- 0135 · 새 사진 상속을 비공개(draft)까지 (2026-09-20)
--
-- 목적·세부분류·성별은 **노출과 상관없이** 붙여 둔다. 공개되는 순간 그대로 검색에 쓰이기 때문이다.
-- 0118 이후 상속은 공개 사진만 대상이었다 — 작가가 비공개로 올렸다가 공개하면 분류가 빈 채로 검색에 들어간다.
-- 보관(archived)은 통째로 내린 사진이라 뺀다.
--
-- 어드민 목적 분류 화면도 같은 날 비공개를 포함하도록 바꿨다(사진에 "비공개" 표시).
--
-- 되돌리기: 0133 의 backfill_inherited_photo_purposes 를 다시 실행
-- ════════════════════════════════════════════════════════════════

-- 0133 그대로 + 비공개(draft) 사진도 물려받는다. 보관(archived)은 뺀다.
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
          and p.visibility <> 'archived' and p.admin_purposes = '{}'
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
   where p.album_id = a.id and p.visibility <> 'archived'
     and p.admin_purposes = '{}' and p.admin_purpose_source is null
     and p.admin_purpose_at is null
     and not p.admin_purpose_reviewed and not p.admin_purpose_overridden;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
