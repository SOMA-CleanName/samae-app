-- ════════════════════════════════════════════════════════════════
-- 0144 · 인기 신호용 페이지뷰 집계 함수 (2026-10-06)
--
--   홈 무드 그리드 순서(rankExploreCategoriesByPopularity)와 매거진 TREND(loadScoredPhotos)는
--   조회수를 세려고 analytics_events 페이지뷰 **원본 행을 통째로** 앱으로 받아 자바스크립트로 셌다
--   (최근 30·60일, .limit(100000)). 그걸 인스턴스마다 1분마다 했다.
--
--   · 방문이 늘수록 테이블이 커져 갈수록 무거워진다 — 2026-10-06 장애 때 Query Performance
--     4위(DB 시간 6%, 평균 472ms · 최대 7.8초)
--   · API 의 최대 행 수(Max rows)에 걸리면 **일부 행만 세고** 있었다 — 순위가 조용히 틀린다
--
--   그래서 세는 일을 DB 안에서 하고, 결과는 **jsonb 한 덩어리**(1행)로 돌려준다 — 행 수 제한에
--   걸리지 않고, 앱으로 오는 건 숫자표뿐이다. 앱은 이걸 1분 메모로 든다(lib/explore-db).
--
--   셈의 규칙은 앱에서 하던 그대로다.
--     · 경로에서 슬러그/사진 id 를 뽑는 정규식: ^/explore/([^/?#]+) · ^/photos/([^/?#]+)
--     · 사진 조회수에서 운영자와 **그 사진의 주인(작가)** 조회는 뺀다. 비로그인 조회는 센다.
--     · 카테고리 조회수는 빼는 사람 없이 센다(앱도 그랬다).
--
--   SECURITY DEFINER — 서버(service_role)만 부른다. 공개 API 로는 막는다(0059 와 같은 규약).
--
--   되돌리기: drop function public.explore_view_counts(timestamptz);
--             drop function public.photo_view_counts(timestamptz);
--             (앱은 함수가 없으면 예전처럼 행을 받아 센다)
-- ════════════════════════════════════════════════════════════════

-- 카테고리(/explore/{slug}) 조회수 → { slug: 조회수 }
create or replace function public.explore_view_counts(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.slug, t.n), '{}'::jsonb)
  from (
    select substring(e.path from '^/explore/([^/?#]+)') as slug, count(*) as n
    from public.analytics_events e
    where e.type = 'pageview'
      and e.created_at >= p_since
      and e.path like '/explore/%'
    group by 1
  ) t
  where t.slug is not null;
$$;

-- 사진(/photos/{id}) 조회수 → { photo_id: 조회수 } — 운영자 · 사진 주인 조회 제외
create or replace function public.photo_view_counts(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select substring(e.path from '^/photos/([^/?#]+)') as photo_key, e.profile_id
    from public.analytics_events e
    where e.type = 'pageview'
      and e.created_at >= p_since
      and e.path like '/photos/%'
  ),
  admins as (
    select id from public.profiles where role = 'admin'
  )
  select coalesce(jsonb_object_agg(t.photo_key, t.n), '{}'::jsonb)
  from (
    select v.photo_key, count(*) as n
    from v
    -- 경로 조각이 uuid 가 아닐 수도 있어 문자열로 붙인다(캐스트 실패로 함수가 죽지 않게)
    left join public.photos p on p.id::text = v.photo_key
    left join public.photographers ph on ph.id = p.photographer_id
    where v.photo_key is not null
      and (
        v.profile_id is null
        or (
          v.profile_id not in (select id from admins)
          and v.profile_id is distinct from ph.profile_id
        )
      )
    group by v.photo_key
  ) t;
$$;

revoke execute on function public.explore_view_counts(timestamptz) from public, anon, authenticated;
revoke execute on function public.photo_view_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.explore_view_counts(timestamptz) to service_role;
grant execute on function public.photo_view_counts(timestamptz) to service_role;
