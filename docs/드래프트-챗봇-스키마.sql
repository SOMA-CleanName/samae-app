-- ─────────────────────────────────────────────────────────────────
-- 문의 챗봇 DB 스키마 드래프트 (C3용 — ⚠️ 아직 적용 금지)
--
-- 챗봇_설계.md §2 의 초안. 팀 합의(§5) 전이라 supabase/migrations/ 에 넣지 않는다.
--
-- [새 목표 플로우 반영 — 리드 구조 폐지]
--   채팅 시작 → 로그인(연락처 확보) → 챗봇 수집(LLM) → 채팅방에 요약 상주
--   → 작가에게 진행중/완료 알림 → 작가가 여유 있을 때 이어받기 → 사용자 SMS 재소환.
--   "리드 생성·연락처 공개" 단계가 없다 — 문의 완료 = 채팅방 상태.
--
-- 합의가 필요한 지점:
--   ① messages.type enum 확장·봇 시스템 프로필 생성을 누가 마이그레이션으로 넣을지 (채팅 부활 담당)
--   ② conversation 생성 시점 (로그인 후 생성 권장 — 로그인 담당)
--   ③ SMS 발송 트리거 인터페이스 (⑤ 알림 큐 안 — SMS/솔라피 담당)
--
-- 코드 쪽 어댑터(마이그레이션 적용 시 이 스키마로 갈아끼움):
--   - persistBotConversation (src/lib/inquiry-bot-persist.ts) — 현재 legacy submitInquiry 호환
--   - notifyPhotographer (src/lib/inquiry-bot-notify.ts) — 현재 디스코드 웹훅/콘솔
-- ─────────────────────────────────────────────────────────────────

-- ⓪ profiles.phone — 이미 존재 확인됨 (마이그레이션 불필요).
--    로그인 게이트 후 챗봇 연락처 스텝에서 1회 수집해 저장 → 작가 첫 응답 시 SMS 재소환에 사용.
--    (카카오 일반 앱은 전화번호 미제공 — 챗봇 단계 수집이 확정 동선)
-- alter table public.profiles add column if not exists phone text; -- 이미 있음, 참고용

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

-- ⑤ 작가 알림 큐 — "새 손님이 챗봇 문의 진행 중/완료" + 사용자 SMS 재소환의 공용 발송 큐.
--    챗봇/서버는 insert 만 하고, 워커(또는 edge function)가 채널별로 발송한다 (설계 §5-2 제안 구체화).
--    현재 코드의 notifyPhotographer(디스코드 직발송)가 이 큐 insert 로 교체되는 자리.
create table public.notification_queue (
  id            uuid primary key default gen_random_uuid(),
  event         text not null check (event in (
                  'bot_inquiry_started',    -- 챗봇 문의 진행 시작 → 작가에게
                  'bot_inquiry_completed',  -- 수집 완료 → 작가에게 "이어받아 주세요"
                  'photographer_replied'    -- 작가 첫 응답 → 사용자 SMS 재소환 (링크 포함)
                )),
  conversation_id uuid references public.conversations(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  channel       text not null default 'auto' check (channel in ('auto', 'discord', 'sms')),
  payload       jsonb not null default '{}',   -- 슬롯 요약 등 (PII 는 수신자 본인 것만)
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index notification_queue_pending_idx
  on public.notification_queue (created_at) where status = 'pending';

-- 같은 대화에 started 알림은 1회만 (완료·응답 알림은 이벤트 성격상 자연 dedupe)
create unique index notification_queue_started_once_idx
  on public.notification_queue (conversation_id, event)
  where event = 'bot_inquiry_started';

alter table public.notification_queue enable row level security;
-- 정책 없음 → service role 전용 (워커·서버 액션만 접근)

-- ⑥ 레퍼런스 이미지 — 별도 테이블 불필요.
--    스토리지: samae-chat 버킷 inquiry-bot/{userId}/ 에 업로드 (라우트 구현 완료),
--    C3에서 conversation 생성 후 type='image' 메시지로 타임라인에 승격.
--    수집 요약(레퍼런스 특징)은 bot_states.answers.custom["레퍼런스"] 에 저장된다.
