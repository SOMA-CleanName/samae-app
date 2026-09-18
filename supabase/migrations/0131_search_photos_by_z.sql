-- ════════════════════════════════════════════════════════════════
-- 0131 · 검색 결과를 z 로 자른다 — 300장 상한 대신
--
-- 지금 검색은 벡터와 가까운 순서로 **무조건 300장**을 준다(similar_photos_by_vector). 300 은
-- "비슷한지" 가 아니라 그냥 잘라낸 숫자라, 검색어와 무관한 사진까지 채워졌다.
--
-- 절대 점수로는 자를 수 없다. 검색어마다 사진 전체의 평균이 달라서, 관련이 끊기는 점수가
-- 바다 0.081 · 한복 0.119 로 들쭉날쭉했다. **그 검색어 평균에서 얼마나 튀어나왔나(z)** 로 보면
-- 장면어 넷이 z 2.0~2.7 에서 끊겼다(docs/29 §12.8). 사람 눈으로 센 관련 비율:
--
--   z 2.5 이상   약 90%   → 검색 결과
--   z 2.0~2.5    약 55%   → "비슷한 무드의 사진들이에요"
--   z 2.0 미만   약 15%   → 보여주지 않는다
--
-- 평균·편차는 **검색 대상 사진 전체**로 잰다. 목적이 있는 검색("가을 커플스냅")도 전체 기준
-- z 를 쓰고 목적으로만 거른다 — 목적 안에서 따로 재면 커플끼리의 상대 순위가 돼서, 커플 중
-- 가장 덜 가을다운 사진도 z 가 높게 나온다.
--
-- HNSW 인덱스를 쓰지 않는다. z 를 내려면 어차피 전부의 점수가 필요하고, 1,602장이면 한 번에
-- 재도 수십 ms 다. 사진이 수만 장이 되면 평균·편차를 미리 계산해 두는 쪽으로 바꾼다.
--
-- **성별 필터도 이 함수를 쓴다 (2026-09-18).** p_min_z 를 아주 낮게(-1000) 주면 목적 안의 사진
-- 전부의 거리를 돌려준다. 앱이 "여자"·"남자" 로 한 번씩 불러 사진마다 어느 쪽에 가까운지 비교한다.
-- similar_photos_by_vector 는 300장에서 잘라 개인 사진 1,027장을 다 볼 수 없었다. z 컷 자체는
-- 앱에서 아직 끈다(SEARCH_Z_CUT_ENABLED) — 적용해도 다른 검색 결과는 바뀌지 않는다.
--
-- 노출 조건은 similar_photos_by_vector(0079)와 같다 — 공개, 피드에서 안 내림, 승인된 작가.
-- 앱은 service_role 로만 부르므로 anon·authenticated 에는 권한을 주지 않는다.
--
-- 되돌리기:
--   drop function if exists public.search_photos_by_z(extensions.halfvec, text[], real);
-- ════════════════════════════════════════════════════════════════

create function public.search_photos_by_z(
  p_embedding extensions.halfvec,
  p_purposes  text[] default null,   -- null 이면 목적으로 거르지 않는다
  p_min_z     real   default 2.0
)
returns table (
  id       uuid,
  distance real,
  z        real
)
language sql
stable
security definer
-- pgvector 타입·연산자(<=>)가 extensions 에 있다(docs/22 §6.1).
set search_path = public, extensions
as $$
  with pool as materialized (
    select p.id, p.admin_purposes, (1 - (p.embedding <=> p_embedding))::real as score
    from public.photos p
    join public.photographers ph on ph.id = p.photographer_id
    where p.visibility = 'published'
      and not p.feed_hidden
      and p.embedding is not null
      and ph.status = 'approved'
  ),
  stats as (
    select avg(score) as mean, stddev_pop(score) as sd from pool
  ),
  scored as (
    select pool.id, pool.admin_purposes, pool.score,
           ((pool.score - stats.mean) / nullif(stats.sd, 0))::real as z
    from pool, stats
  )
  select s.id, (1 - s.score)::real as distance, s.z
  from scored s
  where s.z >= coalesce(p_min_z, 2.0)
    and (p_purposes is null or s.admin_purposes && p_purposes)
  order by s.score desc;
$$;

revoke all on function public.search_photos_by_z(extensions.halfvec, text[], real)
  from public, anon, authenticated;
grant execute on function public.search_photos_by_z(extensions.halfvec, text[], real)
  to service_role;

comment on function public.search_photos_by_z(extensions.halfvec, text[], real) is
  '검색 — 사진 전체 기준 z 가 p_min_z 이상인 사진을 점수순으로. 목적이 있으면 그 목적만(docs/29 §12.8).';
