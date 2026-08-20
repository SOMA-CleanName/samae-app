-- ════════════════════════════════════════════════════════════════
-- 0079 · 임의 벡터 근접검색 RPC — 촬영 페르소나의 "내 사진과 닮은 사매 사진".
--
-- 0069(similar_photos_by_embedding)는 **이미 DB 에 있는 사진 id** 를 씨앗으로 받는다.
-- 페르소나는 사용자의 인스타 사진을 그 자리에서 임베딩해 만든 평균 벡터로 찾아야 하는데,
-- 그 벡터는 photos 에 행이 없으므로 0069 를 쓸 수 없다. 그래서 벡터를 직접 받는 판을 판다.
--
-- 노출 규칙·후보 풀·ef_search 처리는 0069 와 동일하게 맞춘다. 다르게 두면 같은 서비스에서
-- 두 추천이 서로 다른 사진 집합을 보게 되어 원인 추적이 어려워진다.
--
-- 되돌리기:
--   drop function if exists public.similar_photos_by_vector(extensions.halfvec, integer);
-- ════════════════════════════════════════════════════════════════

create or replace function public.similar_photos_by_vector(
  p_embedding extensions.halfvec,
  p_limit     integer default 60
)
returns table (
  id              uuid,
  src_url         text,
  thumb_url       text,
  width           integer,
  height          integer,
  mood_tags       text[],
  album_id        uuid,
  photographer_id uuid,
  distance        real
)
language plpgsql
stable
security definer
-- pgvector 타입·연산자(<=>)가 extensions 에 있다. public 만 두면 42883 이 난다(docs/22 §6.1).
set search_path = public, extensions
as $$
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
$$;

comment on function public.similar_photos_by_vector(extensions.halfvec, integer) is
  '임의 임베딩 벡터로 유사 사진 kNN. 촬영 페르소나(사용자 사진 평균 벡터)용 — 0069 는 사진 id 씨앗 전용.';

-- 페르소나는 비로그인도 쓴다. 다만 이 함수는 서버(서비스 롤)에서만 호출하므로
-- anon 에는 주지 않는다 — 임의 벡터를 넣어 전체 사진 공간을 훑는 걸 막는다.
grant execute on function public.similar_photos_by_vector(extensions.halfvec, integer)
  to service_role;
