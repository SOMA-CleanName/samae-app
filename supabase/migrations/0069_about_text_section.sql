-- ════════════════════════════════════════════════════════════════
-- 0069 · 소개 페이지 — 1단 텍스트(text) 섹션 타입 추가 (2026-08-04)
--   about_sections.type 허용값에 'text' 추가 (단일 단락 텍스트)
-- ════════════════════════════════════════════════════════════════

alter table public.about_sections
  drop constraint about_sections_type_check;

alter table public.about_sections
  add constraint about_sections_type_check
  check (type in ('heading', 'text', 'text_columns', 'quote', 'image_full', 'image_pair', 'image_text'));
