-- notification_queue 에 채널 정보 추가 — 카카오 알림톡 도입 (SMS 는 대체 발송으로 강등).
--   channel        : 실제로 발송(시도)한 채널. 알림톡 요청이 실패해 문자로 넘어갔으면 'sms' 로 갱신된다
--   template_code  : notify-templates.ts 의 kind 별 템플릿 코드 (알림톡 템플릿 ID 는 env 에서 매핑)
--   variables      : 치환 변수 스냅샷 — 감사·재발송용 (PII 는 이름 정도만; 연락처·계좌 금지)
--   provider_group_id : 솔라피 groupId — 콘솔에서 발송 결과를 역추적할 때
alter table public.notification_queue
  add column if not exists channel text not null default 'sms'
    check (channel in ('sms', 'alimtalk')),
  add column if not exists template_code text,
  add column if not exists variables jsonb,
  add column if not exists provider_group_id text;

comment on column public.notification_queue.channel is
  '발송 채널 — alimtalk(카카오 알림톡, 솔라피) | sms(문자, 알림톡 미설정·실패 시 대체)';
comment on column public.notification_queue.kind is
  'chat_reply | inquiry_received | booking_proposed | booking_accepted | deposit_confirmed | booking_confirmed | settlement_paid (src/lib/notify-templates.ts)';
