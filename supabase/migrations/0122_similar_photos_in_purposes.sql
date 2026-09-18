-- ════════════════════════════════════════════════════════════════
-- 0122 · 목적 안에서만 벡터 근접검색 — 검색 결과 "비슷한 무드의 사진들이에요"
--
-- 검색어에 목적이 있으면("가을 커플스냅") 결과를 둘로 나눈다(docs/29 §12).
--   위   가을과 가장 가까운 커플 사진
--   아래 나머지 커플 사진을 가을과 가까운 순으로 — "비슷한 무드의 사진들이에요"
-- 아래도 **검색어의 목적 사진만** 나와야 한다.
--
-- similar_photos_by_vector 는 전체 사진에서 가까운 300장만 준다. 거기 들어온 커플은 이미 전부
-- 위쪽에 가 있어서, 아래에 깔 커플 사진을 받아올 길이 없었다. 그래서 목적 조건을 함수 안에서
-- 걸고 그 안에서만 거리순으로 준다.
--
-- HNSW 인덱스를 **일부러 타지 않는다.** 인덱스로 가까운 순서를 뽑은 뒤 목적으로 거르면
-- ef_search 후보 안에서만 걸러져, 사진이 적은 목적(반려동물 18장)은 결과가 조용히 모자란다.
-- 목적 안의 사진은 많아야 천 장 남짓이라 전부 거리를 재도 가볍다 — 그래서 거리를 먼저
-- 계산해 두고(materialized) 정렬한다.
--
-- 노출 조건은 similar_photos_by_vector(0079)와 같다 — 공개, 피드에서 안 내림, 승인된 작가.
-- 앱은 service_role 로만 부르므로 anon·authenticated 에는 권한을 주지 않는다.
--
-- 되돌리기:
--   drop function if exists public.similar_photos_in_purposes(extensions.halfvec, text[], integer);
-- ════════════════════════════════════════════════════════════════

create function public.similar_photos_in_purposes(
  p_embedding extensions.halfvec,
  p_purposes  text[],
  p_limit     integer default 300
)
returns table (
  id       uuid,
  distance real
)
language sql
stable
security definer
-- pgvector 타입·연산자(<=>)가 extensions 에 있다(docs/22 §6.1).
set search_path = public, extensions
as $$
  with scored as materialized (
    select p.id, (p.embedding <=> p_embedding)::real as distance
    from public.photos p
    join public.photographers ph on ph.id = p.photographer_id
    where p.visibility = 'published'
      and not p.feed_hidden
      and p.embedding is not null
      and p.admin_purposes && p_purposes
      and ph.status = 'approved'
  )
  select s.id, s.distance
  from scored s
  order by s.distance
  limit least(greatest(coalesce(p_limit, 300), 1), 1000);
$$;

revoke all on function public.similar_photos_in_purposes(extensions.halfvec, text[], integer)
  from public, anon, authenticated;
grant execute on function public.similar_photos_in_purposes(extensions.halfvec, text[], integer)
  to service_role;

comment on function public.similar_photos_in_purposes(extensions.halfvec, text[], integer) is
  '목적 안에서만 벡터 근접검색 — 검색 결과 아래 "비슷한 무드" 를 검색어의 목적 사진으로 채운다(docs/29 §12).';
