-- 0059 · 데일리 리포트용 상단 퍼널 집계 함수
-- analytics_events(자체 /api/track 적재) 에서 세션 단위로 유입→조회→문의 퍼널,
-- 채널(utm_source)별 + 광고 소재(utm_content)별 순방문/도달을 한 방에 집계한다.
-- Mixpanel 무료 플랜은 Query API 를 막으므로(402), 상단 퍼널은 우리 데이터로 계산.
--
-- 세션 기준 단계 정의:
--   viewed_photo    : /photos/* 페이지뷰가 있었던 세션 (사진 조회)
--   reached_inquiry : /inquiry* 페이지뷰가 있었던 세션 (문의 페이지 도달)
--   submitted       : 'cta:inquiry_submitted' 클릭 이벤트가 있었던 세션 (참고용 — 미계측 가능)
-- SECURITY DEFINER — RLS(운영자 전용 조회) 우회해 서버(service_role)에서만 호출.

create or replace function public.analytics_funnel(p_from timestamptz, p_to timestamptz)
returns json
language sql
security definer
set search_path = public
as $$
  with ev as (
    select session_id, type, path, label, utm_source, utm_content
    from analytics_events
    where created_at >= p_from and created_at < p_to
  ),
  sess as (
    select
      session_id,
      max(utm_source)  as src,     -- 세션의 utm_source (있으면 비-null 하나)
      max(utm_content) as content, -- 세션의 utm_content = 광고 소재
      bool_or(type = 'pageview' and path like '/photos/%')            as viewed_photo,
      bool_or(type = 'pageview' and path like '/inquiry%')            as reached_inquiry,
      bool_or(type = 'click' and label = 'cta:inquiry_submitted')     as submitted
    from ev
    group by session_id
  )
  select json_build_object(
    'visitors',        (select count(*) from sess),
    'viewed_photo',    (select count(*) from sess where viewed_photo),
    'reached_inquiry', (select count(*) from sess where reached_inquiry),
    'submitted',       (select count(*) from sess where submitted),
    'channels', (
      select coalesce(json_agg(json_build_object('src', src, 'n', n) order by n desc), '[]'::json)
      from (
        select coalesce(nullif(src, ''), '(direct)') as src, count(*) as n
        from sess
        group by 1
      ) c
    ),
    -- 광고 소재(utm_content)별 유입→조회→문의. 메타 매크로 미치환({{...}})·빈값 제외.
    'ads', (
      select coalesce(
        json_agg(
          json_build_object('content', content, 'visitors', v, 'viewed', vp, 'inquiry', ri)
          order by v desc
        ),
        '[]'::json
      )
      from (
        select
          content,
          count(*)                               as v,
          count(*) filter (where viewed_photo)   as vp,
          count(*) filter (where reached_inquiry) as ri
        from sess
        where content is not null and content <> '' and content not like '{{%'
        group by content
      ) a
    )
  );
$$;

-- 공개 API(anon/authenticated)로는 노출 금지 — 서버(service_role)만 호출.
revoke execute on function public.analytics_funnel(timestamptz, timestamptz) from public, anon, authenticated;
