-- ════════════════════════════════════════════════════════════════
-- 0139 · 작가별 안내 이미지 양식 (2026-09-22)
--
--   안내 이미지는 KB 카드에서 자동으로 굽는다(photographer_guide_images).
--   그 "얼굴"을 작가마다 고를 수 있게 한다 — 템플릿 + 배경지.
--
--   별도 테이블을 만들지 않은 이유: 작가당 한 줄짜리 설정이고 항상 작가와 함께
--   읽힌다. 조인 하나를 아끼는 쪽이 낫다.
--
--   { "template": "label", "backdrop": "cream", "backdropUrl": null }
--     · template    : label | letter | ledger | flow | envelope | cover
--     · backdrop    : 프리셋 키 (cream | dawn | glow | mist | sage | ink)
--     · backdropUrl : 작가가 올린 배경 사진. 있으면 프리셋 대신 이것을 깐다.
--
--   값 검증은 앱(guide-style.ts)에서 한다 — 모르는 값이 오면 기본값으로 떨어지므로
--   DB 제약으로 막기보다 화면이 깨지지 않는 쪽을 택했다.
-- ════════════════════════════════════════════════════════════════

alter table public.photographers
  add column if not exists guide_style jsonb not null default '{}'::jsonb;

comment on column public.photographers.guide_style is
  '안내 이미지 양식 — {template, backdrop, backdropUrl}. 빈 객체면 기본값(label + cream).';
