-- 0060 · 작가 '입금완료' 신고 시각
-- 입금 대기(accepted) 상태에서 작가가 스튜디오에서 '입금완료' 버튼을 누른 시각.
-- 이 시점에 운영진 디스코드로 알림(작가·건·금액·예금주명·어드민 링크)이 발송되고,
-- 스튜디오 UI 는 '신고됨 · 운영진 확인 대기' 상태로 표시한다. 실제 입금확인은 운영진이 수동 처리.
alter table public.inquiries
  add column if not exists deposit_reported_at timestamptz;
