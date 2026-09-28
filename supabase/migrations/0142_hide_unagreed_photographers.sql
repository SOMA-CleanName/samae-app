-- ─────────────────────────────────────────────
-- 0142. 계약에 동의하지 않은 작가를 고객 지면에서 가린다 (2026-09-26)
--
-- 왜:
--   광고를 돌리는데 **계약 갱신을 안 한 작가**의 사진에 문의가 꽂히면, 그 문의는
--   받을 사람이 없는 문의가 된다. 고객은 답을 못 받고 작가는 연락 자체를 모른다.
--   지면이 비는 건 되돌릴 수 있지만 "문의했는데 답이 없었다" 는 되돌릴 수 없다.
--
--   동의를 안 한 작가는 AgreeGate 에 막혀 **스튜디오에 들어오지도 못한다.**
--   즉 지금도 문의를 받을 수 없는 상태인데 사진만 계속 노출되고 있었다.
--
-- 어떻게:
--   0126(정지)이 푼 방법을 그대로 쓴다 — 쿼리마다 조건을 더하지 않고
--   **이미 모두가 보고 있는 값**(photos.visibility / packages.is_active)을 내린다.
--   고객 화면 20여 곳이 service_role 로 조회해 RLS 를 통과하므로 그 방법뿐이다.
--
-- ⚠️ 정지와 **이유를 섞지 않는다.** 한 작가가 정지도 되고 미동의이기도 할 수 있다.
--    플래그가 하나면 한쪽을 풀 때 다른 쪽 이유가 남아 있는데도 공개돼 버린다.
-- ─────────────────────────────────────────────

alter table public.photos
  add column if not exists hidden_by_no_agreement boolean not null default false;

alter table public.packages
  add column if not exists hidden_by_no_agreement boolean not null default false;

comment on column public.photos.hidden_by_no_agreement is
  '계약 미동의로 우리가 가린 사진. 작가가 스스로 내린 것과 구분해야 복구가 정확하다';

create index if not exists photos_hidden_by_no_agreement_idx
  on public.photos (photographer_id) where hidden_by_no_agreement;
create index if not exists packages_hidden_by_no_agreement_idx
  on public.packages (photographer_id) where hidden_by_no_agreement;

/**
 * 계약 미동의 → 노출을 끊는다.
 *
 * 공개 중이던 것만 내리고 표시를 남긴다. 이미 비공개인 것은 건드리지 않는다 —
 * 표시를 남기면 복구 때 **작가가 스스로 숨긴 사진까지 공개**된다.
 */
create or replace function public.hide_unagreed_photographer_content(p_photographer_id uuid)
returns table (photos_hidden int, packages_hidden int)
language plpgsql security definer set search_path = public as $$
declare
  p int; k int;
begin
  update public.photos
     set visibility = 'archived', hidden_by_no_agreement = true
   where photographer_id = p_photographer_id
     and visibility = 'published';
  get diagnostics p = row_count;

  update public.packages
     set is_active = false, hidden_by_no_agreement = true
   where photographer_id = p_photographer_id
     and is_active = true;
  get diagnostics k = row_count;

  return query select p, k;
end;
$$;

/**
 * 동의 완료 → 되돌린다.
 *
 * ⚠️ **정지 중이면 공개하지 않는다.** 표시만 지운다. 이유가 둘 다 걸려 있었는데
 *    한쪽만 풀렸다고 공개하면, 정지시킨 작가가 슬그머니 되살아난다.
 *    표시를 지워 두면 나중에 정지가 풀릴 때 restore_photographer_content 가 올린다.
 */
create or replace function public.restore_unagreed_photographer_content(p_photographer_id uuid)
returns table (photos_restored int, packages_restored int)
language plpgsql security definer set search_path = public as $$
declare
  p int; k int;
begin
  update public.photos
     set visibility = case when hidden_by_suspension then visibility else 'published' end,
         hidden_by_no_agreement = false
   where photographer_id = p_photographer_id
     and hidden_by_no_agreement;
  get diagnostics p = row_count;

  update public.packages
     set is_active = case when hidden_by_suspension then is_active else true end,
         hidden_by_no_agreement = false
   where photographer_id = p_photographer_id
     and hidden_by_no_agreement;
  get diagnostics k = row_count;

  return query select p, k;
end;
$$;

-- 서버(service_role)만 실행. 클라이언트에서 직접 호출 차단.
revoke all on function public.hide_unagreed_photographer_content(uuid) from public, anon, authenticated;
revoke all on function public.restore_unagreed_photographer_content(uuid) from public, anon, authenticated;
grant execute on function public.hide_unagreed_photographer_content(uuid) to service_role;
grant execute on function public.restore_unagreed_photographer_content(uuid) to service_role;
