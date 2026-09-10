-- 0102. 사매 문의 — 환불·날짜 변경처럼 규정 판단이 필요한 요청의 접수함.
--
-- 왜 채팅이 아니라 별도 테이블인가:
--   환불·날짜 변경은 작가가 결정할 수 있는 일이 아니다(docs/32). 그런데 고객은 채팅에서
--   작가에게 말하고, 작가는 "환불해드릴게요" 라고 답해버린다 — 그 순간 규정 밖의 약속이 생긴다.
--   그래서 요청을 운영 접수함으로 직접 흘려보내고, 어느 예약 건인지를 함께 들고 오게 한다.
--
-- 고객·작가 양쪽 다 넣을 수 있다. 작가도 "이 예약 날짜를 못 맞추게 됐다" 를 알릴 창구가 필요하다.

create table if not exists public.support_requests (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid references public.bookings(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  requester_id    uuid not null references public.profiles(id) on delete cascade,
  -- 요청자가 고객인지 작가인지 — 같은 예약에 양쪽이 넣을 수 있어 구분이 필요하다
  requester_role  text not null default 'customer',
  kind            text not null default 'other',
  body            text not null default '',
  status          text not null default 'open',
  admin_note      text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  constraint support_requests_kind_check
    check (kind in ('refund', 'reschedule', 'other')),
  constraint support_requests_status_check
    check (status in ('open', 'resolved')),
  constraint support_requests_role_check
    check (requester_role in ('customer', 'photographer'))
);

create index if not exists idx_support_requests_status
  on public.support_requests (status, created_at desc);
create index if not exists idx_support_requests_booking
  on public.support_requests (booking_id);

alter table public.support_requests enable row level security;

-- 본인이 넣은 요청만 본다. 운영은 service_role 로 읽으므로 별도 정책이 필요 없다.
drop policy if exists support_requests_select_own on public.support_requests;
create policy support_requests_select_own on public.support_requests
  for select using (requester_id = auth.uid());

comment on table public.support_requests is
  '사매 문의 접수함 — 환불·날짜 변경 등 규정 판단이 필요한 요청. docs/32';
