-- 작가용 문의 체크리스트 — 봇이 수집 중인 슬롯(촬영종류·희망일·지역·인원·커스텀)을
-- 대화에 실시간 저장해, 작가가 채팅방에서 "무엇이 확인됐고 무엇이 남았는지"를 본다.
-- 고객 클라이언트가 봇 턴마다 동기화(syncBotSlots), 작가 화면은 Realtime UPDATE 로 갱신.
alter table public.conversations
  add column if not exists bot_slots jsonb;
