-- ─────────────────────────────────────────────
-- 0128. 0127 이 **엉뚱한 오버로드를 고쳤다.**
--
-- similar_photos_by_vector 는 둘이다.
--
--   similar_photos_by_vector(vector,  integer, integer)   ← 0127 이 고친 것
--   similar_photos_by_vector(halfvec, integer)            ← 앱이 실제로 부르는 것
--
-- 앱(lib/persona/similar.ts)은 p_embedding·p_limit **두 개**만 넘긴다. 인자 수가 정확히
-- 맞는 halfvec 쪽이 선택되므로, 0127 을 적용하고도 숨긴 사진이 그대로 나왔다.
--
-- ⚠️ 이름이 같은 함수가 여럿일 때는 **호출부가 넘기는 인자로 어느 것이 뽑히는지**를
--    먼저 확인할 것. 정의를 고쳤다고 동작이 바뀐 게 아니다.
--
-- 내용은 0127 과 같다 — 운영이 피드에서 내린 사진(feed_hidden)은 추천에도 넣지 않는다.
-- nearest CTE 안에서 거른다. 바깥에서 거르면 v_pool 만큼 뽑은 뒤에 빠져서 결과가 모자란다.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.similar_photos_by_vector(
  p_embedding halfvec,
  p_limit integer DEFAULT 60
)
RETURNS TABLE(
  id uuid, src_url text, thumb_url text, width integer, height integer,
  mood_tags text[], album_id uuid, photographer_id uuid, distance real
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 300);
  v_pool  integer;
begin
  if p_embedding is null then
    return;
  end if;

  -- 0069 와 같은 이유로 넉넉히 뽑는다(작가 승인 조인에서 걸러지므로).
  v_pool := greatest(v_limit * 3, 300);

  -- ef_search 기본값 40 은 후보 풀보다 작아 조용히 적게·나쁘게 나온다.
  -- 함수 SET 절에는 못 두고(로드 전이라 42501), 본문에서 트랜잭션 한정으로 건다.
  perform set_config('hnsw.ef_search', greatest(v_pool, 100)::text, true);

  return query
  with nearest as (
    -- order by 우변이 상수(파라미터)여야 HNSW 인덱스를 탄다.
    select p.id, p.src_url, p.thumb_url, p.width, p.height,
           p.mood_tags, p.album_id, p.photographer_id,
           (p.embedding <=> p_embedding)::real as distance
    from public.photos p
    where p.visibility = 'published'
      -- 운영이 피드에서 내린 사진은 추천에도 넣지 않는다.
      -- 작가 프로필 포트폴리오에서는 계속 보인다(fetchPhotographerPhotos 는 안 거른다).
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
