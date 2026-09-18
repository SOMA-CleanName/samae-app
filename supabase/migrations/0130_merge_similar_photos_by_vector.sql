-- ════════════════════════════════════════════════════════════════
-- 0130 · similar_photos_by_vector 를 하나로 합친다 — halfvec 유지 + p_pool 살림
--
-- 이 이름의 함수가 둘이면 앱 호출이 통째로 실패한다(docs/22 §6.4).
--
--   (halfvec, integer)            0079 → 0128   앱이 부르는 것. 후보 수 고정
--   (vector, integer, integer)    0127          팀원이 만든 것. p_pool 로 후보 수 조절
--
-- 앱은 p_embedding(JSON 문자열)·p_limit 두 값만 넘긴다. 문자열은 halfvec 로도 vector 로도 맞고,
-- 0127 의 p_pool 에 기본값이 있어 두 값으로도 불리므로 Postgres 가 고르지 못한다
-- ("function ... is not unique"). 9/17 오후 약 한 시간 동안 SigLIP 검색·페르소나 추천이 그랬다.
--
-- 둘을 **하나로** 합친다.
--   · 타입은 halfvec 로 둔다. 사진 벡터(photos.embedding)가 halfvec(1152) 이고, 저장을 반으로
--     줄이려고 고른 타입이다. vector 로 받으면 거리 계산 때 타입을 맞춰야 한다.
--   · p_pool 은 **기본값 null** 로 받는다.
--       두 값으로 부르면  → 지금과 똑같다 (후보 = max(요청×3, 300))
--       p_pool 을 넘기면 → 팀원이 원한 대로 후보 수를 정한다 (요청 장수 ~ 1,000)
--   · 본문은 0128 그대로다 — 숨긴 사진(feed_hidden)은 후보를 뽑기 전에 거른다.
--   · search_path 에 extensions 를 둔다. 0127 은 public 만 두어서 거리 연산자(<=>)를 못 찾아
--     부를 때마다 42883 으로 실패했다(docs/22 §6.1).
--
-- 번호가 0127·0128 뒤라서, 마이그레이션을 번호 순서대로 다시 돌리는 DB(빈 DB·스테이징)에서도
-- 끝 상태가 함수 하나로 고정된다.
--
-- ⚠️ 0079·0127·0128 을 손으로 다시 돌리지 말 것. 셋 다 `create or replace` 라서, 시그니처가
--    다른 함수를 **하나 더** 만들어 다시 둘이 된다. 고칠 때는 이 파일처럼 drop 하고 만든다.
--
-- 되돌리기: 0128 을 다시 돌린 뒤 이 함수를 지운다.
--   drop function if exists public.similar_photos_by_vector(extensions.halfvec, integer, integer);
-- ════════════════════════════════════════════════════════════════

drop function if exists public.similar_photos_by_vector(extensions.vector, integer, integer);
drop function if exists public.similar_photos_by_vector(extensions.halfvec, integer);

create function public.similar_photos_by_vector(
  p_embedding extensions.halfvec,
  p_limit     integer default 60,
  p_pool      integer default null
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
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 300);
  v_pool  integer;
begin
  if p_embedding is null then
    return;
  end if;

  -- 후보를 넉넉히 뽑는다(작가 승인 조인에서 걸러지므로). p_pool 을 주면 그 수를 쓴다.
  v_pool := case
    when p_pool is null then greatest(v_limit * 3, 300)
    else greatest(v_limit, least(p_pool, 1000))
  end;

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
$$;

-- 합치기 전과 같은 권한 — 앱(anon·authenticated·service_role)이 부른다.
grant execute on function public.similar_photos_by_vector(extensions.halfvec, integer, integer)
  to anon, authenticated, service_role;

comment on function public.similar_photos_by_vector(extensions.halfvec, integer, integer) is
  '임의 임베딩 벡터로 유사 사진 kNN. p_pool 을 주면 후보 수를 정한다(없으면 max(요청×3,300)). 0079·0127 을 합친 것 — 이름이 같은 함수를 더 만들지 말 것(docs/22 §6.4).';

-- 앱은 PostgREST 로 부른다. 함수 시그니처가 바뀌었으니 스키마 캐시를 바로 다시 읽게 한다.
notify pgrst, 'reload schema';
