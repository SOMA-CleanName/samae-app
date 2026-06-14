-- 하이라이트 RLS 무한재귀(42P17) 해결
-- 원인: highlights_select 가 highlight_items 를 참조하고, highlight_items_select 가
--       highlights 를 참조 → 상호 순환. 공개(anon) 읽기 시 정책 평가 무한재귀로 에러나
--       하이라이트가 전혀 읽히지 않음(스튜디오/소유자는 is_my_photographer 단락평가로 통과).
-- 해결: highlights_select 가 highlight_items 를 참조하지 않도록 변경.
--       승인 작가의 하이라이트는 공개 읽기 허용(제목·커버는 민감정보 아님).
--       "공개 항목 없는 하이라이트 숨김"은 앱 레이어(shape, onlyPublished)에서 이미 처리.

drop policy if exists highlights_select on public.highlights;
create policy highlights_select on public.highlights for select using (
  public.is_my_photographer(photographer_id)
  or public.is_admin()
  or exists (
    select 1 from public.photographers ph
    where ph.id = highlights.photographer_id
      and ph.status = 'approved'
  )
);

-- highlight_items_select 는 highlights 를 참조하지만, 위에서 highlights_select 가
-- 더 이상 highlight_items 를 참조하지 않으므로 순환이 끊겨 안전하다.
