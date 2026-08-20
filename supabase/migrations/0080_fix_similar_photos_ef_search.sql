-- 유사사진 최대 후보 요청(p_limit=300)에서 v_pool=1200이 되어
-- pgvector의 hnsw.ef_search 상한(1000)을 넘던 오류를 수정한다.
--
-- 운영 DB에 시험 적용됐던 3인자 톤 혼합 함수가 남아 있을 수 있으므로 함께 제거하고,
-- main의 0076 소프트 노출 낮춤 동작을 유지하는 2인자 함수로 복원한다.

drop function if exists public.similar_photos_by_embedding(uuid, integer, real);
drop function if exists public.similar_photos_by_embedding(uuid, integer);

create function public.similar_photos_by_embedding(
  p_photo_id uuid,
  p_limit integer default 120
)
returns table(
  id uuid,
  src_url text,
  thumb_url text,
  width integer,
  height integer,
  mood_tags text[],
  album_id uuid,
  photographer_id uuid,
  distance real,
  feed_hidden boolean
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_embedding extensions.halfvec;
  v_album uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 120), 1), 300);
  v_pool integer;
begin
  select p.embedding, p.album_id into v_embedding, v_album
  from public.photos p where p.id = p_photo_id;

  if v_embedding is null then return; end if;

  -- pgvector가 허용하는 hnsw.ef_search 범위는 1..1000이다.
  -- 최대 요청에서도 후보 풀과 ef_search가 그 상한을 넘지 않게 한다.
  v_pool := least(greatest(v_limit * 4, 400), 1000);
  perform set_config('hnsw.ef_search', v_pool::text, true);

  return query
  with nearest as (
    select p.id, p.src_url, p.thumb_url, p.width, p.height,
           p.mood_tags, p.album_id, p.photographer_id,
           (p.embedding <=> v_embedding)::real as distance,
           p.feed_hidden
    from public.photos p
    where p.visibility = 'published' and p.embedding is not null
    order by p.embedding <=> v_embedding
    limit v_pool
  )
  select n.id, n.src_url, n.thumb_url, n.width, n.height,
         n.mood_tags, n.album_id, n.photographer_id, n.distance, n.feed_hidden
  from nearest n
  join public.photographers ph on ph.id = n.photographer_id
  where ph.status = 'approved'
    and n.id <> p_photo_id
    and (v_album is null or n.album_id is distinct from v_album)
  order by n.distance
  limit v_limit;
end;
$$;

grant execute on function public.similar_photos_by_embedding(uuid, integer)
  to anon, authenticated;
