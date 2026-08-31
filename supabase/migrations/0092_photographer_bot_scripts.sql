-- 작가 커스텀 챗봇 대본 — 파일 하드코딩(photographer-scripts.ts 데모)을 DB로 이관.
--   · tone: 봇 말투 지시 (비면 기본 대본 톤)
--   · custom_questions: 공통 4슬롯 수집 후 이어서 유도할 작가별 질문 (최대 3개, jsonb 문자열 배열)
-- 봇 서버(/api/inquiry-bot)는 service_role 로 읽고, 스튜디오 편집 UI는 RLS(작가 본인)로 읽고 쓴다.
create table if not exists public.photographer_bot_scripts (
  photographer_id uuid primary key references public.photographers(id) on delete cascade,
  tone text not null default '',
  custom_questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.photographer_bot_scripts enable row level security;

-- 작가 본인만 조회·작성·수정 (봇 서버는 service_role 이라 정책 미적용)
drop policy if exists "bot_scripts_select_own" on public.photographer_bot_scripts;
create policy "bot_scripts_select_own" on public.photographer_bot_scripts
  for select using (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

drop policy if exists "bot_scripts_insert_own" on public.photographer_bot_scripts;
create policy "bot_scripts_insert_own" on public.photographer_bot_scripts
  for insert with check (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

drop policy if exists "bot_scripts_update_own" on public.photographer_bot_scripts;
create policy "bot_scripts_update_own" on public.photographer_bot_scripts
  for update using (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );
