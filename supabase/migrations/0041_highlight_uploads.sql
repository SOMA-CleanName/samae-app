-- ════════════════════════════════════════════════════════════════
-- 0041 · 하이라이트 직접 업로드 항목 지원
--   기존: highlight_items.photo_id → 포트폴리오 사진만 참조(NOT NULL).
--   변경: 작가가 9:16으로 크롭해 직접 업로드한 이미지(image_url)도 항목이 될 수 있게.
--         · photo_id 를 nullable 로 풀고 image_url/image_path 추가
--         · 둘 중 하나는 반드시 있어야(check)
--         · 공개 노출 RLS 에 "업로드 항목(image_url)"도 공개로 인정
--   적용: 운영(prod)은 Supabase SQL Editor 에 붙여넣어 실행.
-- ════════════════════════════════════════════════════════════════

alter table public.highlight_items alter column photo_id drop not null;
alter table public.highlight_items add column if not exists image_url  text;
alter table public.highlight_items add column if not exists image_path text;

-- photo_id(포트폴리오) 또는 image_url(직접 업로드) 중 하나는 반드시 존재
alter table public.highlight_items drop constraint if exists highlight_items_source_chk;
alter table public.highlight_items
  add constraint highlight_items_source_chk check (photo_id is not null or image_url is not null);

-- ── 항목 조회 RLS : 직접 업로드 이미지(image_url)도 공개 노출 허용 ──
drop policy if exists highlight_items_select on public.highlight_items;
create policy highlight_items_select on public.highlight_items for select using (
  exists (
    select 1 from public.highlights h
    where h.id = highlight_id and (public.is_my_photographer(h.photographer_id) or public.is_admin())
  )
  or image_url is not null
  or exists (select 1 from public.photos p where p.id = photo_id and p.visibility = 'published')
);

-- ── 하이라이트 조회 RLS : 승인 작가의 하이라이트는 공개 ──
--   ⚠️ highlights_select 는 highlight_items 를 참조하면 안 됨(0027 재귀 방지). highlight_items_select 가
--      highlights 를 참조하므로 상호 순환(42P17)이 된다. "공개 항목 없는 하이라이트 숨김"은 앱 레이어(shape)에서 처리.
drop policy if exists highlights_select on public.highlights;
create policy highlights_select on public.highlights for select using (
  public.is_my_photographer(photographer_id)
  or public.is_admin()
  or exists (
    select 1 from public.photographers ph
    where ph.id = highlights.photographer_id and ph.status = 'approved'
  )
);
