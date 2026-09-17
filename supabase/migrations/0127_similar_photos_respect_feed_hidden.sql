-- ─────────────────────────────────────────────
-- 0127. 유사 사진 추천이 **숨긴 사진을 계속 내보내고 있었다.**
--
-- 증상: 특정 작가의 사진을 피드에서 숨겼는데 페르소나 테스트 결과에는 계속 떴다
-- (2026-09-17 신고). 남자 모델 사진이 적어서 그 작가 사진이 반복해서 뽑혔다.
--
-- 원인: similar_photos_by_vector 가 visibility 와 작가 status 만 보고 feed_hidden 을
-- 보지 않는다. 앱의 다른 추천 경로(purposeMemberPhotos 등)는 이미 거르고 있어서,
-- **한 경로만 새고 있었다.**
--
-- ⚠️ feed_hidden 은 "운영이 피드에서 내린 사진" 이다. 작가 프로필의 포트폴리오에서는
--    계속 보여야 하므로(fetchPhotographerPhotos 는 일부러 안 거른다) 사진을 지우거나
--    visibility 를 내리는 방식으로는 풀 수 없다. 추천하는 쪽이 걸러야 한다.
--
-- nearest CTE 안에서 거른다. 바깥에서 거르면 v_pool 만큼 뽑은 뒤에 빠져서, 숨긴 사진이
-- 많은 경우 결과가 모자란다.
-- ─────────────────────────────────────────────

create or replace function public.similar_photos_by_vector(
  p_embedding vector,
  p_limit integer default 12,
  p_pool integer default 200
)
returns table (
  id uuid,
  src_url text,
  thumb_url text,
  width integer,
  height integer,
  mood_tags text[],
  album_id uuid,
  photographer_id uuid,
  distance real
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 12), 60));
  v_pool  int := greatest(v_limit, least(coalesce(p_pool, 200), 1000));
begin
  perform set_config('hnsw.ef_search', greatest(v_pool, 100)::text, true);

  return query
  with nearest as (
    -- order by 우변이 상수(파라미터)여야 HNSW 인덱스를 탄다.
    select p.id, p.src_url, p.thumb_url, p.width, p.height,
           p.mood_tags, p.album_id, p.photographer_id,
           (p.embedding <=> p_embedding)::real as distance
    from public.photos p
    where p.visibility = 'published'
      -- 운영이 피드에서 내린 사진은 추천에도 넣지 않는다
      and p.feed_hidden = false
      and p.embedding is not null
    order by p.embedding <=> p_embedding
    limit v_pool
  )
  select n.id, n.src_url, n.thumb_url, n.width, n.height,
         n.mood_tags, n.album_id, n.photographer_id, n.distance
  from nearest n
  join public.photographers ph on ph.id = n.photographer_id
  where ph.status = 'approved'
  order by n.distance
  limit v_limit;
end;
$function$;
