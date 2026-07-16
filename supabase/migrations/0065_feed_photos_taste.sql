-- ════════════════════════════════════════════════════════════════
-- 0065 · 취향 기반 홈 피드 — feed_photos_seeded 의 취향 랭킹 버전.
--
-- p_tags(사용자 취향 태그)와 mood_tags 가 겹치는 개수 desc 로 우선 정렬하고,
-- 동점은 기존과 동일한 md5(id||seed) 시드 셔플로 tiebreak. 겹침 0(비매칭)도 뒤에
-- 이어붙어 피드가 끊기지 않는다. p_tags 가 비면 순수 시드(= feed_photos_seeded 와 동일).
--
-- offset/limit 페이지네이션 유지 → 진짜 무한스크롤 그대로. mood_tags GIN 인덱스(0001) 활용.
-- SECURITY DEFINER + published/approved 필터 → anon RLS 와 동일 노출.
-- ════════════════════════════════════════════════════════════════

create or replace function public.feed_photos_taste(
  p_seed text,
  p_tags text[],
  p_offset integer,
  p_limit integer
)
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
  order by
    (
      select count(*)
      from unnest(p.mood_tags) mt
      where mt = any(coalesce(p_tags, '{}'::text[]))
    ) desc,
    md5(p.id::text || coalesce(p_seed, ''))
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 48), 1), 100);
$$;

grant execute on function public.feed_photos_taste(text, text[], integer, integer) to anon, authenticated;
