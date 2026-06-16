-- 0032 · 문의 상담 정보에 레퍼런스 사진 URL 배열 저장
-- 채팅 상담 정보와 동일하게 서버에서 업로드한 public URL만 보관한다.

alter table public.inquiries
  add column if not exists ref_image_paths text[] not null default '{}';
