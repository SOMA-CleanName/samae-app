-- ════════════════════════════════════════════════════════════════
-- 0014 · 사진 좋아요 수 공개 집계
--
-- "사진 좋아요"는 관심 작가(favorites.target_type='photographer')와 별개로,
-- favorites.target_type='photo' 행으로 관리한다(별도 테이블 없이 재사용).
-- favorites 는 RLS 상 본인 행만 조회되므로, 공개 표시용 "총 좋아요 수"는
-- SECURITY DEFINER 함수로 노출한다. (0010 작가 찜 수와 동일 패턴)
-- ════════════════════════════════════════════════════════════════

create or replace function public.photo_like_count(pid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.favorites
  where target_type = 'photo' and target_id = pid;
$$;

grant execute on function public.photo_like_count(uuid) to anon, authenticated;
