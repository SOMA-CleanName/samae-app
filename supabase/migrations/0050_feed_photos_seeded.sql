-- ════════════════════════════════════════════════════════════════
-- 0050 · 홈 피드 무한 스크롤 — 시드 기반 랜덤 정렬 페이지네이션
--
-- 기존엔 서버가 최대 400장만 가져와 클라이언트가 상한(160)까지만 노출 →
-- 사진이 많아도 스크롤이 중간에 멈췄다. 진짜 무제한 스크롤을 위해
-- md5(id || seed) 로 정렬(방문마다 seed 가 달라 순서 변주, 세션 내 seed 고정 시
-- 페이지 순서 일관 → 중복/튐 없음)하고 offset/limit 로 페이지를 내려준다.
--
-- SECURITY DEFINER + 함수 내부에서 published + approved 필터 → anon RLS 와 동일 노출.
-- (2차: feed_pin_rank 컬럼을 더해 상위 N장 고정 예정 — ORDER BY pin_rank NULLS LAST, md5(...))
-- ════════════════════════════════════════════════════════════════

create or replace function public.feed_photos_seeded(p_seed text, p_offset integer, p_limit integer)
returns table (
  id uuid,
  src_url text,
  thumb_url text,
  width integer,
  height integer,
  region text,
  mood_tags text[],
  price_krw integer,
  photographer_id uuid,
  photographer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.src_url, p.thumb_url, p.width, p.height,
         p.region, p.mood_tags, p.price_krw,
         ph.id, ph.display_name
  from public.photos p
  join public.photographers ph on ph.id = p.photographer_id
  where p.visibility = 'published' and ph.status = 'approved'
  order by md5(p.id::text || coalesce(p_seed, ''))
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 48), 1), 100);
$$;

grant execute on function public.feed_photos_seeded(text, integer, integer) to anon, authenticated;
