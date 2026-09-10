-- 0107. contact_card 메시지는 고객 안읽음만 올린다 (docs/32 §3-3)
--
-- 0106 으로 타입만 늘렸는데, 트리거가 이 타입을 모르면 '작가가 보낸 일반 메시지' 로 취급돼
-- 알림이 두 번 간다(전달 액션이 이미 알림을 보낸다). 여기서 갈래를 하나 더 만든다.
--
-- 안읽음은 올린다 — 고객이 눌러야 진행되는 카드라 목록에서 보여야 한다.

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

  -- 챗봇 수집 대화 — 타임라인 갱신만
  if new.type = 'bot' then
    update public.conversations set last_message_at = new.created_at where id = conv.id;
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

  -- 일반 메시지 — 0087 과 동일하게 둔다 (여기서 바꾸면 알림 문구가 조용히 달라진다)
  if new.sender_id = conv.user_id then
    -- 유저 발신 → 작가 수신
    update public.conversations
      set last_message_at = new.created_at, photographer_unread = photographer_unread + 1
      where id = conv.id;
    recipient := ph_profile;
  else
    -- 작가 발신 → 유저 수신
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
