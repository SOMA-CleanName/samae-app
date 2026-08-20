-- 0078 · _migrations 노출 차단 (Supabase Advisor CRITICAL: RLS Disabled in Public)
--
-- 문제: public._migrations 는 PostgREST 로 외부 노출되는데 RLS 가 없고 anon 권한도 남아 있다.
-- 2026-08-19 anon 키로 실측한 결과:
--   · select  → 200 (마이그레이션 파일명·적용시각 전체 조회됨)
--   · insert  → 409 duplicate key   ← 권한을 통과해 제약조건까지 도달. 즉 쓰기가 가능하다.
-- (대조군 photos 는 insert 시 401 42501 로 RLS 가 차단)
--
-- 위험: anon 키는 클라이언트 번들에 포함된 공개 값이다. 이 표의 행을 지우면 다음 마이그레이션
-- 실행 때 기록이 사라진 파일들이 "미적용" 으로 판정돼 재실행되고, create or replace function
-- 계열이 프로덕션 함수를 덮어쓴다. (docs/22 §12.2 에 기록된 바로 그 사고 경로)
--
-- 조치: RLS 를 켜고(정책 없음 = 전면 거부) anon·authenticated 권한을 회수한다.
-- 영향 없음 — migrate.cjs / verify-migrations.cjs 는 SUPABASE_DB_URL 직접 연결(postgres 롤)이라
-- RLS 를 우회하고, 앱 코드(src/)는 이 표를 참조하지 않는다. service_role 도 RLS 를 우회한다.

alter table public._migrations enable row level security;

revoke all on table public._migrations from anon, authenticated;

comment on table public._migrations is
  '마이그레이션 적용 이력. 서버 스크립트 전용 — RLS 전면 거부 + anon/authenticated 권한 회수 (0078).';
