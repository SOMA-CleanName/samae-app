-- ─────────────────────────────────────────────
-- 0049. 검색어 로깅 + 숨김 태그(generated_tags) 운영 함수
--
-- (1) search_logs: 사용자가 메인에서 친 검색어를 적재한다. 정규화 키(compact)로
--     집계해 인기 검색어 랭킹을 내고, result_count=0 이면 '검색 실패어'로 본다.
--     적재는 service_role(서버) 경유 — 클라이언트 직접 insert 정책 없음(기본 거부).
-- (2) admin_delete_generated_tag / admin_rename_generated_tag:
--     검색에만 쓰이는 generated_tags 를 어드민에서 전역 삭제·이름변경(병합)한다.
--     배열 일괄 변경을 원자적으로 처리. service_role 전용(anon/authenticated grant 안 함).
-- ─────────────────────────────────────────────

create table if not exists public.search_logs (
  id           uuid primary key default gen_random_uuid(),
  raw          text not null,                                   -- 사용자 입력 원문
  compact      text not null,                                   -- 정규화 키(집계·클러스터링용)
  result_count integer not null default 0,                      -- 그 검색이 돌려준 사진 수
  profile_id   uuid references public.profiles(id) on delete set null,
  session_id   text,                                            -- (선택) 클라이언트 세션
  created_at   timestamptz not null default now()
);

create index if not exists idx_search_logs_created on public.search_logs (created_at desc);
create index if not exists idx_search_logs_compact on public.search_logs (compact);

alter table public.search_logs enable row level security;

-- 운영자만 조회. insert 는 service_role 경유라 클라이언트 정책을 두지 않는다(= 기본 거부).
drop policy if exists search_logs_admin_select on public.search_logs;
create policy search_logs_admin_select on public.search_logs
  for select using (public.is_admin());

grant select on public.search_logs to anon, authenticated;

-- ── 숨김 태그 전역 삭제 ───────────────────────────────
-- 모든 사진의 generated_tags 배열에서 해당 태그를 제거. 영향 행 수를 돌려준다.
create or replace function public.admin_delete_generated_tag(p_tag text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.photos
  set generated_tags = array_remove(generated_tags, p_tag)
  where generated_tags @> array[p_tag];
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ── 숨김 태그 이름변경·병합 ───────────────────────────
-- p_from → p_to 로 치환. 치환 결과 중복이 생기면 distinct 로 정리한다.
create or replace function public.admin_rename_generated_tag(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.photos
  set generated_tags = (
    select coalesce(array_agg(distinct x), '{}')
    from unnest(array_replace(generated_tags, p_from, p_to)) as x
  )
  where generated_tags @> array[p_from];
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- service_role 전용 — 클라이언트 역할에는 실행 권한을 주지 않는다.
revoke all on function public.admin_delete_generated_tag(text) from anon, authenticated;
revoke all on function public.admin_rename_generated_tag(text, text) from anon, authenticated;
