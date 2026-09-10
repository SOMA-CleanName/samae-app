-- 0086 에 이어지는 트리거 조정 — enum 새 값은 추가된 트랜잭션 안에서 못 쓰므로 파일 분리.
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

  -- 챗봇 수집 대화(과거 이력 승격 포함) — 타임라인 갱신만, 안읽음·알림은 만들지 않는다
  -- (작가에게는 summary_card 시점에 한 번만 알린다)
  if new.type = 'bot' then
    update public.conversations set last_message_at = new.created_at where id = conv.id;
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
end;
$$;
