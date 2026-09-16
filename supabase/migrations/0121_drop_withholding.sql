-- 원천징수와 주민등록번호를 되돌린다 — **우리는 원천징수 의무자가 아니다**
--
-- 126 국세상담 확인(2026-09-16). 소득세법 제127조는 의무를 **지급하는 자**에게 지운다.
-- 촬영 계약은 고객과 작가 사이이고, 대금은 PG 가 받아 작가와 사매에게 각각 나눠 보낸다 —
-- **우리 계좌를 거치지 않는다.** 그래서 우리는 지급자가 아니고, 고객은 개인이라 의무가 없고,
-- PG 는 송금 실행자일 뿐이다. 결국 의무자가 없어 작가가 5월에 직접 종합소득세를 신고한다.
--
-- ⚠️ **"중개업이라서" 가 아니라 "대금을 안 만져서" 다.** 정산 구조를 바꿔 사매 계좌를
--    경유하게 되면 이 결론이 뒤집힌다 — 그때는 0118·0119 를 되살려야 한다.
--
-- 🔴 주민등록번호는 **수집 근거 자체가 사라졌다.** 개인정보보호법 제24조의2 는 법령 근거가
--    없는 주민번호 처리를 금지하고, 정보주체의 동의로도 갈음할 수 없다. 보관하고 있을 수
--    없으므로 컬럼째 지운다. (실제 수집 건수 0 — 되돌리기 가장 싼 시점이었다)
--
-- 되돌리는 것: 0118(주민등록번호) · 0119(원천징수)

-- ── 주민등록번호 (0118) ─────────────────────────────
alter table public.photographers
  drop column if exists resident_no_enc,
  drop column if exists resident_no_masked,
  drop column if exists resident_no_at;

-- 접근 로그도 함께 — 열람 대상이 없어졌으므로 기록도 남길 이유가 없다
drop table if exists public.resident_no_access_logs;

-- ── 원천징수 (0119) ─────────────────────────────────
-- `withholding_krw` 만 지운다. `settlement_breakdown` 은 **남긴다** — 정산 내역서
-- (작가약관 13-4)가 "왜 이 금액이었나" 를 재현하는 근거이고, 원천징수와 무관하다.
alter table public.bookings
  drop column if exists withholding_krw;

comment on column public.bookings.settlement_breakdown is
  '지급 시점의 정산 계산 스냅샷(대금·수수료·부가세·사업자유형). 정산 내역서의 근거';
