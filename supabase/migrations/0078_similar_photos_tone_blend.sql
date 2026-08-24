-- ════════════════════════════════════════════════════════════════
-- 0078 · 7단계 도입 — 근접검색 점수에 톤을 α 비율로 섞는다. (docs/22 §7.6)
--
--   거리 = α × (SigLIP 코사인거리) + (1−α) × scale × (톤 코사인거리)
--
-- **운영값 α = 0.9** (= 톤 10%). 0076 까지의 동작은 α = 1.0 이며, 이 함수에
-- 1.0 을 넘기면 그때와 완전히 같은 결과가 나온다 — 되돌리기가 인자 하나다.
--
-- 왜 HNSW 인덱스를 건드리지 않는가
--   인덱스는 연산자 하나만 태울 수 있어 혼합 점수로는 못 탄다. 대신 0076 이
--   이미 후보를 400장 뽑으므로, **그 풀 안에서만 다시 정렬한다.** 톤이 풀 밖의
--   사진을 끌어올 수는 없다는 뜻인데, α=0.9 에서 톤의 기여가 작아 실질 차이가
--   없고 오히려 "톤은 비슷한데 피사체가 전혀 다른 사진" 이 튀어드는 것을 막는다.
--   이 근사는 오프라인 하네스(eval_tone.py · 전역 정렬)와 다른 유일한 지점이다.
--
-- 왜 α 를 상수로 박지 않고 인자로 두는가
--   docs/22 §7.6 '도입하려면' 이 그렇게 설계해 두었다. 되돌리기가 배포가 아니라
--   호출 인자이므로 사고 시 복구가 빠르다. 앱은 인자를 넘기지 않고 기본값을 쓴다.
--
-- 왜 scale 은 인자가 아니라 테이블에서 읽는가
--   α 는 '결정'이지만 scale 은 '측정값'이다. 카탈로그가 바뀌면 다시 재어야 하고,
--   그 측정은 tone_backfill.py --fit 이 한다. 사람이 고를 값이 아니다.
--
-- 안전 폴백 — 아래 중 하나라도 해당하면 α 를 1.0 으로 낮춰 0076 동작으로 돈다.
--   · 활성 기준 통계가 없다 (0077 만 적용하고 백필 전)
--   · 시드 사진에 tone_vec 이 없다 (업로드 직후 · 배치 전)
--   후보 쪽 tone_vec 이 비었을 때는 코사인거리를 1.0(= 직교 = 모집단 평균)으로
--   본다. 톤을 모르는 사진이 그 이유로 상·하향되지 않게 하는 중립값이다.
--
-- 되돌리기: 0076_photo_feed_demotion.sql 을 그대로 다시 실행한다.
-- ════════════════════════════════════════════════════════════════

-- 인자 목록이 바뀌므로 create or replace 로는 덮이지 않는다. 그냥 두면 2인자·
-- 3인자 두 함수가 공존해 PostgREST 가 "could not choose the best candidate
-- function" 을 낸다. 반드시 먼저 지운다.
drop function if exists public.similar_photos_by_embedding(uuid, integer);

create function public.similar_photos_by_embedding(
  p_photo_id uuid,
  p_limit    integer default 120,
  p_alpha    real    default 0.9
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
  v_tone      extensions.vector(22);
  v_album     uuid;
  v_limit     integer := least(greatest(coalesce(p_limit, 120), 1), 300);
  v_pool      integer;
  v_alpha     real := least(greatest(coalesce(p_alpha, 0.9), 0.0), 1.0);
  v_scale     real;
begin
  select p.embedding, p.tone_vec, p.album_id
    into v_embedding, v_tone, v_album
  from public.photos p where p.id = p_photo_id;

  if v_embedding is null then return; end if;

  select s.blend_scale into v_scale
  from public.photo_tone_stats s where s.is_active;

  -- 위 '안전 폴백' 참조. 톤을 못 쓰는 상황이면 0076 과 같은 동작으로 떨어진다.
  if v_tone is null or v_scale is null then
    v_alpha := 1.0;
  end if;
  -- α=1.0 이면 아래 곱셈에서 v_scale 이 쓰이지 않지만, null 을 그대로 두면
  -- 0 × null = null 이 되어 거리 전체가 null 이 된다. 반드시 0 으로 접는다.
  v_scale := coalesce(v_scale, 0);

  v_pool := greatest(v_limit * 4, 400);
  perform set_config('hnsw.ef_search', greatest(v_pool, 100)::text, true);

  return query
  with nearest as (
    -- 이 order by 의 우변이 상수여야 HNSW 인덱스를 탄다(docs/22 §6.2).
    -- 톤은 여기서 계산하지 않는다 — 정렬·자르기 전에 400장 밖까지 계산될 수 있다.
    select p.id, p.src_url, p.thumb_url, p.width, p.height,
           p.mood_tags, p.album_id, p.photographer_id,
           (p.embedding <=> v_embedding)::real as emb_distance,
           p.tone_vec, p.feed_hidden
    from public.photos p
    where p.visibility = 'published' and p.embedding is not null
    order by p.embedding <=> v_embedding
    limit v_pool
  ),
  blended as (
    -- 노출 규칙(published·approved·시드 제외·같은 게시물 제외)을 먼저 걸러
    -- 버릴 행에 톤 계산을 낭비하지 않는다.
    select n.id, n.src_url, n.thumb_url, n.width, n.height,
           n.mood_tags, n.album_id, n.photographer_id, n.feed_hidden,
           (v_alpha * n.emb_distance
              + (1 - v_alpha) * v_scale
                * coalesce((n.tone_vec <=> v_tone)::real, 1.0))::real as blended_distance
    from nearest n
    join public.photographers ph on ph.id = n.photographer_id
    where ph.status = 'approved'
      and n.id <> p_photo_id
      and (v_album is null or n.album_id is distinct from v_album)
  )
  -- 별칭을 blended_distance 로 둔 이유: returns table 의 OUT 이름(distance)은
  -- 함수 본문에서 변수라, order by distance 라고 쓰면 컬럼이 아니라 그 변수를
  -- 가리켜 정렬이 조용히 망가진다.
  select b.id, b.src_url, b.thumb_url, b.width, b.height,
         b.mood_tags, b.album_id, b.photographer_id,
         b.blended_distance, b.feed_hidden
  from blended b
  order by b.blended_distance
  limit v_limit;
end;
$$;

grant execute on function public.similar_photos_by_embedding(uuid, integer, real)
  to anon, authenticated;
