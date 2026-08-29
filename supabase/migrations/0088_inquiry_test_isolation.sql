-- ════════════════════════════════════════════════════════════════
-- 0088 · 테스트 문의 격리
--
-- 사고: 2026-08-27 챗봇 개발 중 넣은 테스트 문의가 실제 작가(kiwi_film)에게 전달됐다.
--       작가는 이걸 진짜 리드로 알고 리드비 10,000원을 입금했고,
--       "테스트였다"는 안내를 받은 뒤 8분 만에 포트폴리오 217장을 전부 내렸다.
--
-- 문제의 본질: 테스트 문의와 실제 문의가 **같은 테이블·같은 경로**를 타는데
--            둘을 구분할 표시가 없었다. 사람이 조심하는 것 말고는 막을 방법이 없었다.
--
-- 이 컬럼 하나로 경로를 가른다:
--   is_test = true 면
--     · 작가에게 알림이 가지 않고 (notifyPhotographer 스킵)
--     · 작가 대시보드 목록에서 제외되고 (lib/inquiries.ts 필터)
--     · 운영진 디스코드 알림에는 [테스트] 로 찍히고 (알림 자체는 와야 테스트가 되므로)
--     · 어드민 목록에서 배지로 구분된다
--
-- 판정은 앱(lib/inquiry-test.ts)이 한다 — 운영자 계정이 넣었거나, 테스트 연락처 목록에 있으면 테스트.
--
-- 적용: 운영(prod)은 Supabase SQL Editor 또는 psql.
-- ════════════════════════════════════════════════════════════════

alter table public.inquiries
  add column if not exists is_test boolean not null default false;

comment on column public.inquiries.is_test is
  '테스트 문의 — 작가에게 전달되지 않는다. 운영자 계정 접수 또는 테스트 연락처(TEST_INQUIRY_PHONES)일 때 true.';

-- 작가 대시보드 조회는 (photographer_id, status) 로 들어오고 여기에 is_test 필터가 붙는다.
create index if not exists idx_inquiries_photographer_live
  on public.inquiries (photographer_id, status, created_at desc)
  where is_test = false and hidden_from_photographer = false;

-- ── 과거 데이터 정리 ────────────────────────────────────────────
-- kiwi_film 에게 갔던 8/27 테스트 문의를 소급 표시한다.
-- (이미 환불 처리됐지만, 지표·어드민 목록에서 실제 리드로 집계되면 안 된다)
update public.inquiries i
set is_test = true
from public.photographers p
where i.photographer_id = p.id
  and p.display_name = 'kiwi_film'
  and i.created_at >= '2026-08-27 09:00:00+00'
  and i.created_at <  '2026-08-27 10:00:00+00';
