-- 챗봇 대화의 채팅 승격 (C3) — messages 타입 확장 + 알림 트리거 조정
-- · 'bot'          : 챗봇 수집 대화(사용자 답 포함 — sender 로 화자 구분). 안읽음·알림 미발생
-- · 'summary_card' : 문의 완료 요약 카드(body=JSON). 작가 안읽음 +1 + "새 문의" 알림
alter type message_type add value if not exists 'bot';
alter type message_type add value if not exists 'summary_card';
