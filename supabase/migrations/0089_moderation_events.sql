-- 채팅 검열 이벤트 — 오프플랫폼(개인 SNS·연락처) 유도 시도 기록.
-- 메시지는 차단되어 저장되지 않으므로, 시도 원문은 여기에만 남는다 (어드민 열람용).
-- 접근은 service role 전용 — RLS 켜고 정책 없음.
create table if not exists public.moderation_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  sender_role     text not null check (sender_role in ('photographer', 'customer')),
  body            text not null,
  matched         text[] not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.moderation_events enable row level security;

create index if not exists moderation_events_conv_idx
  on public.moderation_events (conversation_id, created_at desc);
create index if not exists moderation_events_created_idx
  on public.moderation_events (created_at desc);
