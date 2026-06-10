-- ════════════════════════════════════════════════════════════════
-- 0016 · 채팅방 나가기(per-side 숨김)
--   · 각 참여자가 자기 쪽에서만 대화를 숨길 수 있도록 타임스탬프 컬럼 추가
--   · 리스트는 last_message_at > hidden_at 인 경우만 노출 → 새 메시지 오면 다시 보임
-- ════════════════════════════════════════════════════════════════

alter table public.conversations
  add column if not exists user_hidden_at         timestamptz,
  add column if not exists photographer_hidden_at timestamptz;
