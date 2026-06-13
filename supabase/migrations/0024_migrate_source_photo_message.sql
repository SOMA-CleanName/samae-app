-- ════════════════════════════════════════════════════════════════
-- 0024 · 기존 '사진 첨부 첫 메시지'를 출처 사진으로 이관
--   · 과거엔 사진 상세에서 문의 시작 시 "이 사진을 보고 문의드려요" 이미지 메시지를 넣었음.
--   · 이제는 채팅 버블이 아니라 상담 정보에 "문의한 사진"으로 노출한다.
--   · 기존 데이터도 동일하게: 대화의 출처 사진으로 옮긴 뒤 그 메시지를 삭제.
-- ════════════════════════════════════════════════════════════════

-- 1) 대화별 출처 사진 backfill (아직 비어 있을 때만)
update public.conversations c
set source_photo_path = m.image_path
from public.messages m
where m.conversation_id = c.id
  and m.type = 'image'
  and m.body = '이 사진을 보고 문의드려요'
  and m.image_path is not null
  and c.source_photo_path is null;

-- 2) 안내용 이미지 메시지 삭제
delete from public.messages
where type = 'image'
  and body = '이 사진을 보고 문의드려요';

-- 3) last_message_at 재계산 — insert 트리거만 갱신하고 delete는 미갱신하므로,
--    남은 메시지 기준으로 다시 맞춘다(메시지가 없으면 null → 빈 방으로 숨김 대상).
update public.conversations c
set last_message_at = (
  select max(m.created_at) from public.messages m where m.conversation_id = c.id
);

-- 4) 메시지가 모두 사라진 방은 안읽음 배지 초기화
update public.conversations c
set user_unread = 0, photographer_unread = 0
where not exists (select 1 from public.messages m where m.conversation_id = c.id);
