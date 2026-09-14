-- 예약 제안 알림 kind 를 방향별로 분리 — 카카오 알림톡 심사 대응.
--
-- booking_proposed 한 종으로 심사를 넣었다가 두 번 반려됐다:
--   09-09  "수신 대상을 명확하게 확인하기 어렵다. 사내 관리자 대상 메시지인가?"
--   09-11  "수신자의 어떠한 액션으로 발송되는지 답변 또는 메시지 내 추가"
--
-- 제안은 작가→고객·고객→작가 양방향이라 한 문장으로는 수신자를 특정할 수 없다.
-- 그래서 booking_proposed_to_photographer / _to_customer 로 쪼갰다.
--
-- kind 는 CHECK 제약이 없는 자유 텍스트라 **스키마 변경은 필요 없다.** 이 파일은
-- 주석(문서)만 현행화한다. 이미 쌓인 booking_proposed 행은 과거 기록이므로
-- 그대로 둔다 — 발송 이력을 소급해 고쳐 쓰면 감사 추적이 망가진다.

comment on column public.notification_queue.kind is
  'chat_reply | chat_message_to_photographer | inquiry_received | '
  'booking_proposed_to_photographer | booking_proposed_to_customer | '
  'booking_accepted | deposit_confirmed | booking_confirmed | settlement_paid '
  '(src/lib/notify-templates.ts). 2026-09-11 이전 행에는 booking_proposed 가 남아 있다.';
