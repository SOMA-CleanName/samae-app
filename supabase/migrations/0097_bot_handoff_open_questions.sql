-- ════════════════════════════════════════════════════════════════
-- 0097 · 봇 인계(handoff) 영구화 + 봇이 못 답한 질문 기록 (2026-08-27)
--
--   기존: "작가 개입" 을 매 턴 messages 이력에서 파생(mapDbMessagesToBotHistory)했다.
--   문제: 상태가 어디에도 남지 않아 (a) 인계 안내를 한 번만 띄우기 어렵고
--         (b) "다시 활성화되지 않는다" 는 규칙이 이력 해석에 의존한다.
--   → conversations 에 못을 박는다. 한 번 서면 되돌리지 않는다(단방향).
--
--   bot_open_questions: 봇이 KB 로 답할 수 없어 작가에게 넘긴 질문.
--   작가는 스튜디오/채팅방에서 이 목록을 보고 답하고, 운영은 KB 보강 소재로 쓴다.
-- ════════════════════════════════════════════════════════════════

alter table public.conversations
  add column if not exists bot_disabled_at timestamptz,       -- 작가 첫 발화 = 봇 영구 정지 시각
  add column if not exists bot_handoff_notified_at timestamptz; -- "작가님이 들어왔어요" 안내 게시 시각

comment on column public.conversations.bot_disabled_at is
  '작가가 이 방에서 처음 직접 발화한 시각. 세팅되면 봇은 다시 발화하지 않는다(단방향).';

create table if not exists public.bot_open_questions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  question        text not null,
  answered_at     timestamptz,           -- 작가가 방에서 답한 뒤 닫힘
  created_at      timestamptz not null default now()
);
create index if not exists idx_open_questions_room
  on public.bot_open_questions (conversation_id, created_at desc);
create index if not exists idx_open_questions_pending
  on public.bot_open_questions (photographer_id, answered_at, created_at desc);

alter table public.bot_open_questions enable row level security;

-- 조회: 그 방의 고객·작가 본인·운영자. (기록은 service_role 서버 액션이 남긴다)
drop policy if exists "open_questions_select" on public.bot_open_questions;
create policy "open_questions_select" on public.bot_open_questions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
    or exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

-- 작가가 답 처리(닫기)만 할 수 있게
drop policy if exists "open_questions_update_own" on public.bot_open_questions;
create policy "open_questions_update_own" on public.bot_open_questions
  for update using (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_id and p.profile_id = auth.uid()
    )
  );

grant select, update on public.bot_open_questions to authenticated;
