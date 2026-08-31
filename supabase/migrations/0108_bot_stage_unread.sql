-- 0108. 챗봇 단계에서도 작가 안읽음을 센다
--
-- 지금까지 type='bot' 메시지는 타임라인만 갱신하고 안읽음을 올리지 않았다.
-- 그런데 **개입 전 고객 발화도 type='bot' 으로 저장된다**(무알림을 위해). 그 결과
-- 손님이 봇과 한참 이야기해도 작가 목록에는 아무 표시가 없어, 작가는 문의가 오고 있다는
-- 사실 자체를 몰랐다.
--
-- 발신자로 가른다:
--   고객이 쓴 것  → 작가 안읽음 +1 (목록에 숫자가 떠야 들어가 본다)
--   봇이 쓴 것    → 타임라인만 (작가 대신 한 말이라 작가에게 새 소식이 아니다)
--
-- 알림(notifications)은 여전히 만들지 않는다. 수집 중 매 턴 알림이 가면 그건 소음이고,
-- 작가에게 한 번 알리는 건 summary_card 가 맡는다.

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
