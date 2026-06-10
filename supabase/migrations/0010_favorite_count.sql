-- ════════════════════════════════════════════════════════════════
-- 0010 · 작가 찜 수 공개 집계
--
-- favorites 는 RLS 상 본인 행만 조회 가능하므로, 공개 표시용 "총 찜 수"는
-- SECURITY DEFINER 함수로 노출한다. (사진 상세 2단계의 '찜 수')
-- 좋아요는 별도 기능 없이 찜으로 통합(백로그 §5 Q3=2).
-- ════════════════════════════════════════════════════════════════

create or replace function public.photographer_favorite_count(pid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.favorites
  where target_type = 'photographer' and target_id = pid;
$$;

grant execute on function public.photographer_favorite_count(uuid) to anon, authenticated;
