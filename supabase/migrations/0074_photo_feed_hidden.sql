-- ════════════════════════════════════════════════════════════════
-- 0074 · 사진 피드 숨김 (운영자 전용)
--
-- 운영자가 '둘러보기 면에 띄우고 싶지 않은 사진'을 고를 수 있게 한다.
--   숨김  = 홈 피드 · 사진 상세 하단 추천 · /c/<slug> 카테고리 · 탐색 · 검색에서 제외
--   유지  = 사진 상세(/photos/<id>) 자체 · 게시물 캐러셀 · 작가 포트폴리오 · 사이트맵
-- (visibility='archived' 와 다르다. 그건 사진을 통째로 내리는 것이고, 이건 노출 면만 줄인다.)
--
-- 앱 쿼리는 각 조회 함수에서 feed_hidden 을 거르고, 피드 RPC 3종은 아래에서 함께 갱신한다.
-- ════════════════════════════════════════════════════════════════

alter table public.photos
  add column if not exists feed_hidden boolean not null default false;

-- 숨김은 소수라 부분 인덱스(어드민 '숨김만' 조회용)
create index if not exists idx_photos_feed_hidden
  on public.photos (feed_hidden)
  where feed_hidden;

-- 변경 가드 — photos_write RLS 는 작가 본인 사진 수정을 허용하므로(is_my_photographer),
-- 그대로 두면 작가가 스스로 숨김을 해제할 수 있다. 운영자/서버만 바꾸도록 막는다. (0073 과 동일 패턴)
create or replace function public.guard_photo_feed_hidden()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.feed_hidden is distinct from old.feed_hidden then
    if not public.is_service_context() and not public.is_admin() then
      raise exception '사진 피드 숨김 변경 권한이 없습니다 (운영자/서버 전용)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_photos_feed_hidden_guard on public.photos;
create trigger trg_photos_feed_hidden_guard
  before update on public.photos
  for each row execute function public.guard_photo_feed_hidden();

-- ── 피드 RPC 3종 — 숨김 제외 조건 추가 (본문은 기존 그대로) ──

-- 홈 일반 피드 (0050)
create or replace function public.feed_photos_seeded(p_seed text, p_offset integer, p_limit integer)
returns table(id uuid, src_url text, thumb_url text, width integer, height integer,
              region text, mood_tags text[], price_krw integer,
              photographer_id uuid, photographer_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.src_url, p.thumb_url, p.width, p.height,
         p.region, p.mood_tags, p.price_krw, ph.id, ph.display_name
  from public.photos p
  join public.photographers ph on ph.id = p.photographer_id
  where p.visibility = 'published' and ph.status = 'approved' and not p.feed_hidden
  order by md5(p.id::text || coalesce(p_seed, ''))
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 48), 1), 100);
$$;

-- 홈 취향 랭킹 피드 (0065)
create or replace function public.feed_photos_taste(p_seed text, p_tags text[], p_offset integer, p_limit integer)
returns table(id uuid, src_url text, thumb_url text, width integer, height integer,
              region text, mood_tags text[], price_krw integer,
              photographer_id uuid, photographer_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.src_url, p.thumb_url, p.width, p.height,
         p.region, p.mood_tags, p.price_krw, ph.id, ph.display_name
  from public.photos p
  join public.photographers ph on ph.id = p.photographer_id
  where p.visibility = 'published' and ph.status = 'approved' and not p.feed_hidden
  order by
    (select count(*) from unnest(p.mood_tags) mt where mt = any(coalesce(p_tags,'{}'::text[]))) desc,
    md5(p.id::text || coalesce(p_seed, ''))
  offset greatest(coalesce(p_offset,0),0)
  limit least(greatest(coalesce(p_limit,48),1),100);
$$;

-- 사진 상세 하단 추천 (0069) — 후보 풀 단계에서 거른다(뒤에서 걸러내면 장수가 모자람)
create or replace function public.similar_photos_by_embedding(p_photo_id uuid, p_limit integer default 120)
returns table(id uuid, src_url text, thumb_url text, width integer, height integer,
              mood_tags text[], album_id uuid, photographer_id uuid, distance real)
language plpgsql stable security definer set search_path = public, extensions as $$
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

  if v_embedding is null then
    return;
  end if;

  v_pool := greatest(v_limit * 3, 300);

  perform set_config('hnsw.ef_search', greatest(v_pool, 100)::text, true);

  return query
  with nearest as (
    select p.id, p.src_url, p.thumb_url, p.width, p.height,
           p.mood_tags, p.album_id, p.photographer_id,
           (p.embedding <=> v_embedding)::real as distance
    from public.photos p
    where p.visibility = 'published'
      and p.embedding is not null
      and not p.feed_hidden
    order by p.embedding <=> v_embedding
    limit v_pool
  )
  select n.id, n.src_url, n.thumb_url, n.width, n.height,
         n.mood_tags, n.album_id, n.photographer_id, n.distance
  from nearest n
  join public.photographers ph on ph.id = n.photographer_id
  where ph.status = 'approved'
    and n.id <> p_photo_id
    and (v_album is null or n.album_id is distinct from v_album)
  order by n.distance
  limit v_limit;
end;
$$;
