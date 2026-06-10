-- ════════════════════════════════════════════════════════════════
-- 0008 · 사진별 가격·장소·가격노출 토글
--
-- 배경(2026-06-04 결정): 작가가 사진 단위로 가격과 촬영 장소를 적을 수 있게.
-- 패키지가 아니라 "그 사진"의 가격·장소만 기입한다(백로그 §1).
--   - price_krw      : 사진 1건 촬영가(선택, null 허용)
--   - price_visible  : 가격 노출 on/off. 값은 유지한 채 노출만 토글.
--   - location_text  : 촬영 장소(자유 텍스트). 지역 필터용 region 과 별개.
-- ════════════════════════════════════════════════════════════════

alter table public.photos
  add column if not exists price_krw     integer,
  add column if not exists price_visible boolean not null default false,
  add column if not exists location_text text;
