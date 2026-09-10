-- ════════════════════════════════════════════════════════════════
-- 0099 · 봇 고정 메시지 (2026-08-27)
--
--   봇이 항상 같은 문장으로 말하는 자리들(인사·인계 안내·이관·오류)이
--   코드 상수라 문구 하나 다듬으려면 배포가 필요했다. 정책과 같은 이유로 DB 로 뺀다.
--
--   전부 비어 있으면 코드 상수로 폴백한다 (bot-identity.ts / bot-kb.ts).
--   {작가} 는 작가 표시이름으로 치환되는 토큰.
-- ════════════════════════════════════════════════════════════════

alter table public.bot_settings
  -- 말풍선에 뜨는 봇 이름 (작가와 구분되는 정체성)
  add column if not exists bot_name      text not null default '',
  -- 상담 모드 방의 첫 인사. 작가별 인사말(photographer_bot_kb.greeting)이 있으면 그게 우선
  add column if not exists msg_greeting  text not null default '',
  -- 작가가 대화에 들어온 순간 봇이 물러나며 남기는 한 줄
  add column if not exists msg_handoff   text not null default '',
  -- 답할 근거가 없을 때 (KB 미등록·킬스위치)
  add column if not exists msg_no_answer text not null default '',
  -- LLM 실패 시
  add column if not exists msg_error     text not null default '';

comment on column public.bot_settings.msg_greeting is
  '{작가} 토큰은 작가 표시이름으로 치환된다.';
