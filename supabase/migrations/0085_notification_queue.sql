-- 외부 채널 알림 큐 (SMS → 추후 알림톡) — 발송 이력·중복 억제·감사 로그를 겸한다.
-- in-app notifications(0004)와 별개: 이 테이블은 "서비스 밖으로 나가는" 재소환 알림 전용.
-- 접근은 service role 전용 — RLS 켜고 정책 없음.
create table if not exists public.notification_queue (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,               -- 'chat_reply' 등
  profile_id   uuid references public.profiles (id) on delete set null,
  phone        text,                        -- 발송 시점의 수신 번호 (프로필에서 복사)
  body         text not null,
  dedupe_key   text not null,               -- 예: chat_reply:<conversation_id> — 쿨다운 판정용
  status       text not null default 'pending'
               check (status in ('pending', 'sent', 'failed', 'skipped')),
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

alter table public.notification_queue enable row level security;

create index if not exists notification_queue_dedupe_idx
  on public.notification_queue (dedupe_key, created_at desc);
create index if not exists notification_queue_status_idx
  on public.notification_queue (status, created_at);
