-- ════════════════════════════════════════════════════════════════
-- 0004 · 채팅 (메시지 트리거 + 알림 + 이미지 버킷 + Realtime)
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 메시지 insert 시: 대화 last_message_at·안읽음 갱신 + 수신자 알림 생성
-- ─────────────────────────────────────────────
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

create trigger trg_on_message_insert
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- ─────────────────────────────────────────────
-- 채팅 이미지 버킷 (공개 읽기, 업로드는 서버 service_role)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('samae-chat', 'samae-chat', true)
on conflict (id) do nothing;

drop policy if exists "chat public read" on storage.objects;
create policy "chat public read"
  on storage.objects for select
  using (bucket_id = 'samae-chat');

-- ─────────────────────────────────────────────
-- Realtime 발행 등록 (RLS가 구독 권한을 게이트)
-- ─────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.notifications;
