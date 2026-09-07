-- 작가 답장 알림(chat_reply)을 "즉시"에서 "예약 후 재확인"으로 바꾼다.
--
-- 왜: 작가가 답할 때마다 바로 쏘면 두 가지가 깨진다.
--   ① 고객이 채팅방을 열어둔 채 대화 중이어도 알림이 간다 (읽고 있는데 알림)
--   ② 작가가 연달아 여러 줄을 보내면 그만큼 알림이 쌓인다
-- 그래서 발송을 몇 분 미루고, 그 시점에 여전히 안 읽었을 때만 보낸다.
-- 열어두고 대화 중이면 그 사이 읽히므로(user_unread=0) 자연히 발송이 취소된다.
-- "지금 보고 있는지" 를 따로 추적하지 않고 지연으로 푸는 것이 이 설계의 요지다.
--
-- 거래 알림(예약 제안·수락·입금 확인·정산)은 그대로 즉시 발송이다.
-- 늦게 가면 거래가 멈추는 알림이라 지연 대상이 아니다.
--
-- scheduled_at    — 이 시각 이후에 실행기가 집어간다 (null = 즉시 발송분)
-- conversation_id — 발송 직전 안읽음을 재확인하려면 필요하다.
--                   dedupe_key 를 파싱해도 되지만 조인이 안 되고 인덱스도 못 탄다.
alter table public.notification_queue
  add column if not exists scheduled_at timestamptz,
  add column if not exists conversation_id uuid
    references public.conversations (id) on delete cascade;

comment on column public.notification_queue.scheduled_at is
  '예약 발송 시각 — 이 시각 이후 크론(/api/cron/notify-queue)이 집어간다. null 이면 즉시 발송분(과거 행)';
comment on column public.notification_queue.conversation_id is
  '읽음 재확인 대상 — chat_reply 예약에만 채워진다';

-- 실행기가 "지금 보낼 것"만 훑는 경로
create index if not exists notification_queue_due_idx
  on public.notification_queue (scheduled_at)
  where status = 'pending' and scheduled_at is not null;

-- 인덱스를 걸기 전에 같은 키로 겹쳐 있는 pending 을 정리한다.
-- (발송 도중 죽어 pending 으로 남은 행이 있을 수 있다. 가장 최근 1건만 살리고
--  나머지는 skipped 로 닫는다 — 지우지 않는 건 감사 로그라서)
update public.notification_queue q
   set status = 'skipped',
       error  = coalesce(q.error, 'superseded')
 where q.status = 'pending'
   and exists (
     select 1
       from public.notification_queue p
      where p.dedupe_key = q.dedupe_key
        and p.status = 'pending'
        and (p.created_at, p.id) > (q.created_at, q.id)
   );

-- 같은 사건에 대기 중인 예약은 하나뿐이어야 한다.
-- 작가가 3줄을 연달아 보내도 예약은 1건 — 애플리케이션 조건문 대신 DB 로 막는다.
-- (dispatchNotify 는 23505 를 "이미 예약됨" 으로 보고 조용히 넘어간다)
create unique index if not exists notification_queue_pending_one_idx
  on public.notification_queue (dedupe_key)
  where status = 'pending';
