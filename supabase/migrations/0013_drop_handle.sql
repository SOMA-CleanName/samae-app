-- ─────────────────────────────────────────────
-- 0013 핸들 제거 — 작가명(display_name) 단일 식별로 통일
-- 공개 프로필 URL은 작가 id 기준(/photographers/:id)으로 전환
-- ─────────────────────────────────────────────

-- 빈 작가명 백필 (not null 제약 전 안전장치)
update public.photographers
set display_name = '작가'
where display_name is null or trim(display_name) = '';

-- 작가명 필수화 + handle 제거(unique 인덱스도 함께 삭제됨)
alter table public.photographers
  alter column display_name set not null;

alter table public.photographers
  drop column handle;
