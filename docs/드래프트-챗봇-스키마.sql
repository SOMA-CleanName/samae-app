-- ─────────────────────────────────────────────────────────────────
-- 문의 챗봇 DB 스키마 드래프트 (C2/C3용 — ⚠️ 아직 적용 금지)
--
-- 챗봇_설계.md §2 의 초안. 팀 합의(§5) 전이라 supabase/migrations/ 에 넣지 않는다.
-- 합의가 필요한 지점:
--   ① messages.type enum 확장·봇 시스템 프로필 생성을 누가 마이그레이션으로 넣을지 (채팅 부활 담당)
--   ② conversation 생성 시점 (로그인 후 생성 권장 — 로그인 담당)
--   ③ SMS 발송 트리거 인터페이스 (notifications_queue 안 — SMS 담당)
-- C1은 DB 없이 클라이언트 로컬 상태(localStorage)로만 동작한다.
-- ─────────────────────────────────────────────────────────────────

-- ① 봇 상태: conversation 단위 1행
--    C1의 localStorage 답변 저장을 서버 저장으로 승격하는 자리.
--    answers 는 inquiry-bot.ts 의 BotAnswers 와 동일 구조
--    ({purpose, preferredDate, region, partySize, "custom:{id}": ...}).
create table public.conversation_bot_states (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  status          text not null default 'collecting'
                  check (status in ('collecting', 'done', 'handed_off')),
  -- collecting: 봇 질문 진행 중 / done: 요약 카드 게시 완료 / handed_off: 작가 개입으로 봇 중단(C3)
  answers         jsonb not null default '{}',
  photo_id        uuid references public.photos(id) on delete set null, -- 문의 시작 사진
  current_step    text,             -- inquiry-bot.ts BotStep.key (복원용)
  updated_at      timestamptz not null default now()
);

create trigger conversation_bot_states_updated_at
  before update on public.conversation_bot_states
  for each row execute function public.set_updated_at();

-- RLS: 봇 상태 읽기는 대화 당사자만, 쓰기는 서버(service role)만
--      (봇 메시지 insert 와 동일하게 서버 액션에서만 갱신 — 설계 §6 리스크 참고)
alter table public.conversation_bot_states enable row level security;

create policy "bot_states_select_participants" on public.conversation_bot_states
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user_id = auth.uid()
             or c.photographer_id in (select id from public.photographers where profile_id = auth.uid()))
    )
  );
-- insert/update 정책 없음 → service role 전용

-- ② 작가 커스텀 질문 (0~3개) — C2에서 스튜디오 설정 UI로 관리.
--    클라이언트에는 inquiry-bot.ts 의 CustomBotQuestion 형태로 내려가
--    buildFlow(custom) 으로 공통 4문항 뒤에 삽입된다.
create table public.photographer_bot_questions (
  id               uuid primary key default gen_random_uuid(),
  photographer_id  uuid not null references public.photographers(id) on delete cascade,
  sort_order       int not null default 0,
  question         text not null,             -- 예: "원하는 무드나 레퍼런스가 있나요?"
  options          text[] not null default '{}', -- 비면 자유 입력
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create index photographer_bot_questions_photographer_idx
  on public.photographer_bot_questions (photographer_id, sort_order)
  where is_active;

alter table public.photographer_bot_questions enable row level security;

-- 활성 질문은 누구나 조회 가능(문의 진입 시 필요), 관리는 소유 작가만
create policy "bot_questions_select_active" on public.photographer_bot_questions
  for select using (is_active);

create policy "bot_questions_manage_owner" on public.photographer_bot_questions
  for all using (
    photographer_id in (select id from public.photographers where profile_id = auth.uid())
  );

-- ③ messages.type enum 확장 — 봇 발화·요약 카드를 일반 메시지 타임라인에 저장
--    (요약 카드는 body 에 JSON 을 담고 렌더러가 카드로 표시 + 채팅방 상단 고정)
--    ⚠️ enum 확장은 별도 트랜잭션 필요 — 채팅 부활 담당자의 마이그레이션과 합쳐서 적용.
alter type message_type add value if not exists 'bot';
alter type message_type add value if not exists 'summary_card';

-- ④ 봇 시스템 프로필 — messages.sender_id 는 profiles FK 라 봇 계정 1개가 필요.
--    auth.users 트리거(handle_new_user)를 타지 않는 시드 행. id 는 고정 UUID 로 예약.
--    봇 메시지 insert 는 서버(service role)에서만 수행한다 (RLS 우회 경로 없음).
-- insert into public.profiles (id, display_name, avatar_url)
-- values ('00000000-0000-0000-0000-00000000b0b0', '사매 문의 도우미', null)
-- on conflict (id) do nothing;
