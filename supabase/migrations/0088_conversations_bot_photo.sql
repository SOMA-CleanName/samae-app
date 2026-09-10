-- 챗봇 문의의 출발 사진 — 진행 중(미접수) 대화방에서 봇 채팅으로 복귀할 때
-- /inquiry/bot?photographerId&photoId 를 재구성하기 위한 참조.
alter table public.conversations
  add column if not exists bot_photo_id uuid references public.photos (id) on delete set null;
