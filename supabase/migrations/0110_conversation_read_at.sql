-- 채팅방을 마지막으로 읽은 시각 — 작가 답장 알림을 보낼지 판정하는 데 쓴다.
--
-- 문제: 고객이 채팅방을 열어둔 채 대화 중인데도 답장마다 알림이 갔다.
--
-- user_unread 로는 이걸 못 잡는다. 작가가 보내면 트리거가 +1 하고 곧바로
-- 알림 판정이 도는데, 고객 브라우저의 읽음 처리(realtime → markRead)는 그 뒤에
-- 도착한다. 판정 시점에는 항상 "안 읽음" 으로 보인다.
--
-- 그래서 "지금 보고 있는가" 를 최근 읽은 시각으로 본다. 방을 열어두고 있으면
-- 상대 메시지가 올 때마다 markRead 가 불리므로(ChatRoom.tsx) 이 값이 계속 갱신된다.
--
-- 쿨다운 리셋에도 쓴다: 한 번 알림을 보낸 뒤 고객이 읽고 나갔다면, 그 다음 답장은
-- 다시 알려야 한다. "안 읽은 채로 또 보내지 않는다" 가 쿨다운의 본뜻이라서다.
alter table public.conversations
  add column if not exists user_read_at timestamptz;

comment on column public.conversations.user_read_at is
  '고객이 이 방을 마지막으로 읽은 시각 (markRead). 답장 알림 억제·쿨다운 리셋 판정용';

-- 기존 방은 "안읽음이 없으면 최근에 읽은 것" 으로 본다.
-- 정확한 시각은 알 수 없지만 마지막 메시지 시각이 상한이다.
update public.conversations
   set user_read_at = coalesce(last_message_at, created_at)
 where user_read_at is null
   and user_unread = 0;
