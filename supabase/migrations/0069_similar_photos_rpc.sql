-- ════════════════════════════════════════════════════════════════
-- 0069 · 시각 유사도 근접검색 RPC — "이런 사진은 어때요?" 의 후보 조회.
--
-- 0068 이 채운 photos.embedding 으로 사진→사진 kNN 을 돈다. 클릭된 사진이
-- 이미 자기 벡터를 갖고 있으므로 조회 시점에 모델 추론이 없다(docs/22 §5.1).
--
-- 노출 규칙은 기존 RPC(feed_photos_taste 등)와 동일하게 맞춘다.
--   visibility = 'published' AND photographers.status = 'approved'
--
-- 되돌리기:
--   drop function if exists public.similar_photos_by_embedding(uuid, integer);
-- ════════════════════════════════════════════════════════════════

create or replace function public.similar_photos_by_embedding(
  p_photo_id uuid,
  p_limit    integer default 120
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
-- search_path 에 extensions 가 필요하다. pgvector 타입·연산자(<=>)가 거기 있어서
-- public 만 두면 'operator does not exist' 가 난다(docs/22 §6.1).
set search_path = public, extensions
-- hnsw.ef_search 는 여기(함수 SET 절)에 둘 수 없다. CREATE FUNCTION 시점에는
-- pgvector 라이브러리가 세션에 로드돼 있지 않아 Postgres 가 이 이름을 정체불명의
-- placeholder 로 보고, placeholder 설정은 superuser 만 가능해 42501 이 난다.
-- Supabase 의 postgres 롤은 superuser 가 아니다. → 본문에서 set_config 로 건다.
as $$
declare
  v_embedding extensions.halfvec;
  v_album     uuid;
  v_limit     integer := least(greatest(coalesce(p_limit, 120), 1), 300);
  v_pool      integer;
begin
  select p.embedding, p.album_id
    into v_embedding, v_album
  from public.photos p
  where p.id = p_photo_id;

  -- 임베딩이 아직 없는 사진(신규 업로드)은 빈 결과를 준다.
  -- 앱은 이 경우 기존 태그 방식으로 폴백한다(docs/22 §7.2).
  if v_embedding is null then
    return;
  end if;

  -- 넉넉히 뽑는 이유 두 가지.
  --   1) photographers.status='approved' 는 다른 테이블이라 HNSW 인덱스 조건에
  --      넣을 수 없다 → 뽑은 뒤 조인에서 걸러진다.
  --   2) 같은 게시물(앨범) 사진끼리는 당연히 가까워서 상위를 통째로 먹는다.
  -- 두 필터를 통과하고도 v_limit 이 남도록 3배로 잡는다.
  v_pool := greatest(v_limit * 3, 300);

  -- HNSW 탐색 폭. 기본값 40 은 후보 풀(300+)보다 작아, 요청한 만큼 돌려주지
  -- 못하고 조용히 적게·나쁘게 나온다. 에러가 아니라 품질 저하로만 드러나므로
  -- 반드시 풀 크기 이상으로 올린다.
  -- 위 select 가 이미 embedding 을 읽어 pgvector 가 로드된 뒤라 여기서는 통과한다.
  -- 세 번째 인자 true = 트랜잭션 한정 → 커넥션 풀에 설정이 남지 않는다.
  perform set_config('hnsw.ef_search', greatest(v_pool, 100)::text, true);

  return query
  with nearest as (
    -- 이 order by 의 우변이 상수여야 HNSW 인덱스를 탄다. 서브쿼리로 시드 벡터를
    -- 끌어오면 계획 시점에 상수가 아니라 Seq Scan 으로 떨어지므로, 위에서 변수에
    -- 담아 두고 여기서 쓴다.
    select p.id, p.src_url, p.thumb_url, p.width, p.height,
           p.mood_tags, p.album_id, p.photographer_id,
           (p.embedding <=> v_embedding)::real as distance
    from public.photos p
    where p.visibility = 'published'
      and p.embedding is not null
    order by p.embedding <=> v_embedding
    limit v_pool
  )
  select n.id, n.src_url, n.thumb_url, n.width, n.height,
         n.mood_tags, n.album_id, n.photographer_id, n.distance
  from nearest n
  join public.photographers ph on ph.id = n.photographer_id
  where ph.status = 'approved'
    and n.id <> p_photo_id
    -- 같은 게시물 제외. 앱이 아니라 여기서 거르는 이유는 위 2)와 같다 —
    -- 앱에서 걸러내면 이미 후보 예산을 다 써버린 뒤라 남는 장수가 모자란다.
    -- 앨범 '간격 배치'(spaceByAlbum)는 여전히 앱 책임이다.
    and (v_album is null or n.album_id is distinct from v_album)
  order by n.distance
  limit v_limit;
end;
$$;

-- anon 도 사진 상세를 보므로 익명 실행을 허용한다(기존 RPC 와 동일).
grant execute on function public.similar_photos_by_embedding(uuid, integer)
  to anon, authenticated;
