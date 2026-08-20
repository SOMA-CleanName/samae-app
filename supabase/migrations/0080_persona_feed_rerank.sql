-- ════════════════════════════════════════════════════════════════
-- 0080 · 페르소나 벡터 저장 + 피드 재정렬 거리 RPC (하이브리드 피드)
--
-- 목적: "이 무드로 사진 더 보기" 피드를 무드 카테고리 티어링(기존) 위에
-- **사용자 피드 벡터와의 시각 유사도 순**으로 재정렬한다.
--   · 티어(목적∩무드 → 목적 → 무드)는 그대로 — 어떤 사진이 보일지는 기존 로직
--   · 그 안의 순서만 임베딩 거리순 — 어떤 사진이 먼저 보일지가 바뀐다
--
-- 벡터는 분석 시 persona_results 에 저장하고, 브라우저에는 행 id(uuid)만 쿠키로 준다.
-- 1152차원 벡터를 쿠키에 싣는 건 불가능(~9KB+)하고, 원시 벡터를 클라이언트에
-- 노출할 이유도 없다 — RPC 는 id 로 벡터를 서버 안에서만 꺼내 쓴다.
--
-- 되돌리기:
--   drop function if exists public.persona_photo_distances(uuid, uuid[]);
--   alter table public.persona_results drop column if exists embedding;
-- ════════════════════════════════════════════════════════════════

alter table public.persona_results
  add column if not exists embedding extensions.halfvec(1152);

comment on column public.persona_results.embedding is
  '분석 표본 사진들의 평균 SigLIP2 벡터(L2 정규화). 피드 재정렬용 — 없으면(임베딩 서비스 미가동) 재정렬 생략.';

-- 주어진 사진들에 대한 거리만 계산한다 — 전역 kNN(0079)과 달리 후보 집합이 이미
-- 정해져 있으므로(피드 한 페이지, ~48장) 인덱스 없이도 ~ms 다.
create or replace function public.persona_photo_distances(
  p_result_id uuid,
  p_photo_ids uuid[]
)
returns table (id uuid, distance real)
language plpgsql
stable
security definer
-- pgvector 연산자(<=>)가 extensions 스키마에 있다 (docs/22 §6.1)
set search_path = public, extensions
as $$
declare
  v_embedding extensions.halfvec;
begin
  select r.embedding into v_embedding
  from public.persona_results r
  where r.id = p_result_id
    and r.expires_at > now();  -- 만료된 결과의 벡터는 쓰지 않는다 (캐시 수명과 일치)

  if v_embedding is null then
    return; -- 빈 결과 → 호출부는 원래 순서 유지
  end if;

  return query
  select p.id, (p.embedding <=> v_embedding)::real
  from public.photos p
  where p.id = any(p_photo_ids)
    and p.embedding is not null;
end;
$$;

comment on function public.persona_photo_distances(uuid, uuid[]) is
  '페르소나 결과 벡터와 주어진 사진들의 코사인 거리. 홈 피드 페이지 단위 재정렬용 — 서버 전용.';

-- 서버(서비스 롤)에서만 호출 — 결과 id 를 안다고 해서 anon 이 임의 사진 집합의
-- 거리 프로파일을 뽑아가게 둘 이유가 없다.
grant execute on function public.persona_photo_distances(uuid, uuid[]) to service_role;
