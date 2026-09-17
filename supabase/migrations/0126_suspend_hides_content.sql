-- ─────────────────────────────────────────────
-- 0126. 작가를 내보내면 그 작가의 것이 **어디서도 안 보이게.**
--
-- 지금은 정지(status='suspended')해도 사진과 패키지가 그대로 노출된다. 확인한 사실:
--
-- (숨김 값은 'archived' 다 — photo_visibility 는 published/draft/archived 셋뿐이고,
--  draft 는 "작성 중" 이라 우리가 내린 것과 뜻이 다르다)
--
--   · RLS 가 안 막는다 — photos_select 는 `visibility='published'`, packages_select 는
--     `is_active=true` 만 본다. 작가 상태를 보지 않는다(highlights 만 제대로 본다)
--   · RLS 를 고쳐도 안 막힌다 — 고객 화면(discovery·explore·categories·tags·sitemap·
--     검색·페르소나)이 전부 service_role 로 조회해 **RLS 를 통과한다**
--   · 앱 쿼리 20여 곳 중 작가 상태를 거르는 건 일부뿐이다
--
-- 쿼리마다 조건을 더하는 방법은 택하지 않았다. 빠뜨리기 쉽고, 새 쿼리가 생기면 또 샌다.
-- 대신 **이미 모두가 보고 있는 값**(visibility / is_active)을 내린다. 그러면 고치지 않은
-- 경로까지 한 번에 가려진다.
--
-- ⚠️ 되돌릴 수 있어야 한다. 작가가 **스스로 숨겨 둔** 사진과 **우리가 가린** 사진을
--    구분하지 못하면, 복귀시켰을 때 원래 비공개였던 사진까지 공개된다. 그래서 우리가
--    가린 것에만 표시를 남기고, 복귀 때 그 표시가 있는 것만 되돌린다.
--
-- 문의·예약·정산 기록은 건드리지 않는다(요구사항). 작가를 못 보게 하는 것과
-- 지난 거래를 지우는 것은 다른 일이다.
-- ─────────────────────────────────────────────

alter table public.photos
  add column if not exists hidden_by_suspension boolean not null default false;

alter table public.packages
  add column if not exists hidden_by_suspension boolean not null default false;

-- 복귀 시 "우리가 가린 것" 만 빠르게 찾는다
create index if not exists photos_hidden_by_suspension_idx
  on public.photos (photographer_id) where hidden_by_suspension;
create index if not exists packages_hidden_by_suspension_idx
  on public.packages (photographer_id) where hidden_by_suspension;

/**
 * 작가 내보내기 — 노출을 끊는다.
 *
 * 공개 중이던 것만 내리고 표시를 남긴다. 이미 비공개인 것은 건드리지 않는다 —
 * 표시를 남기면 복귀 때 작가 의사와 무관하게 공개되어 버린다.
 */
create or replace function public.suspend_photographer_content(p_photographer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.photos
     set visibility = 'archived', hidden_by_suspension = true
   where photographer_id = p_photographer_id
     and visibility = 'published';

  update public.packages
     set is_active = false, hidden_by_suspension = true
   where photographer_id = p_photographer_id
     and is_active = true;
end;
$$;

/** 복귀 — 우리가 가린 것만 되돌린다 */
create or replace function public.restore_photographer_content(p_photographer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.photos
     set visibility = 'published', hidden_by_suspension = false
   where photographer_id = p_photographer_id
     and hidden_by_suspension;

  update public.packages
     set is_active = true, hidden_by_suspension = false
   where photographer_id = p_photographer_id
     and hidden_by_suspension;
end;
$$;

revoke all on function public.suspend_photographer_content(uuid) from public, anon, authenticated;
revoke all on function public.restore_photographer_content(uuid) from public, anon, authenticated;
