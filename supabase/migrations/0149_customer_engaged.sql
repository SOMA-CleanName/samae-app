-- 0149. 고객이 아무 말도 안 한 챗봇 방을 작가에게 숨긴다
--
-- 문의하기를 누르면 방이 생기고 "이 사진 보고 문의드려요"(문의한 사진)가 **고객 명의로** 시드된다.
-- 트리거가 이걸 일반 고객 메시지로 받아서 작가 안읽음 +1 · "새 메시지: 사진을 보냈어요" 알림 ·
-- 목록 노출이 전부 일어났다. 2026-10-10 기준 방 12개 중 7개가 고객이 한 글자도 안 친 방이었다.
--
-- 고객이 시드 말고 무언가 보낸 첫 시각을 customer_engaged_at 에 남기고, 작가 목록은 이것으로 거른다.

alter table public.conversations add column if not exists customer_engaged_at timestamptz;

create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conv public.conversations;
  ph_profile uuid;
  recipient uuid;
  preview text;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  select profile_id into ph_profile from public.photographers where id = conv.photographer_id;

  -- 0149. 방을 열 때 고객 명의로 깔리는 '문의한 사진'(시드)은 고객이 한 말이 아니다.
  --       타임라인만 갱신하고 안읽음·알림도, 고객 참여 표시도 하지 않는다.
  --       문구는 src/lib/inquiry-bot-room.ts 의 SEED_PHOTO_BODY 와 같아야 한다.
  if new.type = 'image' and new.sender_id = conv.user_id and new.body = '이 사진 보고 문의드려요' then
    update public.conversations set last_message_at = new.created_at where id = conv.id;
    return null;
  end if;

  -- 고객이 실제로 무언가 보낸 첫 시각 — 작가 목록 노출 기준
  if new.sender_id = conv.user_id and conv.customer_engaged_at is null then
    update public.conversations set customer_engaged_at = new.created_at where id = conv.id;
  end if;

  -- 챗봇 단계 — 고객 발화만 작가 안읽음으로. 알림은 만들지 않는다
  if new.type = 'bot' then
    if new.sender_id = conv.user_id then
      update public.conversations
        set last_message_at = new.created_at, photographer_unread = photographer_unread + 1
        where id = conv.id;
    else
      update public.conversations set last_message_at = new.created_at where id = conv.id;
    end if;
    return null;
  end if;

  -- 연락처 전달 카드 — 고객 안읽음만. 알림은 전달 액션이 이미 보냈다
  if new.type = 'contact_card' then
    update public.conversations
      set last_message_at = new.created_at, user_unread = user_unread + 1
      where id = conv.id;
    return null;
  end if;

  -- 문의 완료 요약 카드 → 작가 수신으로 취급
  if new.type = 'summary_card' then
    update public.conversations
      set last_message_at = new.created_at, photographer_unread = photographer_unread + 1
      where id = conv.id;
    if ph_profile is not null then
      insert into public.notifications (recipient_id, type, title, body, link)
      values (ph_profile, 'chat', '새 문의', '챗봇이 정리한 문의가 도착했어요', '/chat/' || conv.id);
    end if;
    return null;
  end if;

  -- 일반 메시지 — 0087 그대로 (여기서 바꾸면 알림 문구가 조용히 달라진다)
  if new.sender_id = conv.user_id then
    update public.conversations
      set last_message_at = new.created_at, photographer_unread = photographer_unread + 1
      where id = conv.id;
    recipient := ph_profile;
  else
    update public.conversations
      set last_message_at = new.created_at, user_unread = user_unread + 1
      where id = conv.id;
    recipient := conv.user_id;
  end if;

  preview := case when new.type = 'image' then '사진을 보냈어요' else left(coalesce(new.body, ''), 50) end;

  if recipient is not null then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (recipient, 'chat', '새 메시지', preview, '/chat/' || conv.id);
  end if;

  return null;
end $$;

-- 기존 방 채우기 — 시드 사진을 뺀 고객 메시지의 첫 시각
update public.conversations c
   set customer_engaged_at = (
     select min(m.created_at) from public.messages m
      where m.conversation_id = c.id and m.sender_id = c.user_id
        and not (m.type = 'image' and m.body = '이 사진 보고 문의드려요'))
 where c.customer_engaged_at is null;

-- 시드가 올려둔 작가 안읽음 정리 (고객이 아무것도 안 보낸 방)
update public.conversations set photographer_unread = 0
 where customer_engaged_at is null and photographer_unread > 0;
