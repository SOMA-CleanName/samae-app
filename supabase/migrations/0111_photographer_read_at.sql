-- 작가가 채팅방을 마지막으로 읽은 시각 — 0110 의 작가 쪽 짝.
--
-- 0110 은 고객 쪽(user_read_at)만 만들었다. 그때는 알림이 **작가 → 고객** 한 방향이라
-- 작가 쪽 판정이 필요 없었고, 주석에도 *"작가 쪽은 아직 이 판정을 쓰지 않아 대응 컬럼을
-- 두지 않았다"* 고 적어 뒀다.
--
-- 이제 반대 방향도 알린다 — **고객이 보내면 작가도 알림을 받는다.** 그러려면 작가가
-- 그 방을 보고 있는지를 같은 방식으로 알아야 한다. 안 그러면 작가가 채팅을 열어둔 채
-- 대화하는 동안에도 메시지마다 알림이 간다(0110 이 고객 쪽에서 고쳤던 바로 그 문제).
alter table public.conversations
  add column if not exists photographer_read_at timestamptz;

comment on column public.conversations.photographer_read_at is
  '작가가 이 방을 마지막으로 읽은 시각 (markRead). 메시지 알림 억제·쿨다운 리셋 판정용';

-- 기존 방 보정 — 0110 과 같은 근거. 안읽음이 없으면 최근에 읽은 것으로 본다.
-- 정확한 시각은 알 수 없지만 마지막 메시지 시각이 상한이다.
--
-- 이 보정이 없으면 photographer_read_at 이 null 인 모든 방이 "한 번도 안 읽음" 으로
-- 잡혀서, 배포 직후 고객이 메시지를 보내는 순간 작가에게 리마인더가 몰린다.
update public.conversations
   set photographer_read_at = coalesce(last_message_at, created_at)
 where photographer_read_at is null
   and photographer_unread = 0;
