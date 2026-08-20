-- ════════════════════════════════════════════════════════════════
-- 0082 · 페르소나 결과에 파이프라인 버전 태깅
--
-- 문제(2026-08-20 실사용에서 확인): 분석 파이프라인을 업그레이드해 배포했는데
-- 같은 아이디로 재분석하면 72h 캐시가 **구버전 결과**를 그대로 돌려줬다.
-- 사용자 입장에선 "배포했다는데 아무것도 안 바뀜"으로 보인다.
--
-- 조치: 결과 행에 파이프라인 버전을 기록하고, 캐시 조회 시 현재 버전과 다르면
-- 미스로 취급한다(행은 남겨 공유 링크는 계속 열린다 — 공유는 버전 불문).
-- 버전 상수는 src/lib/persona/store.ts 의 PIPELINE_VERSION — 파이프라인의
-- 산출물 형태가 바뀌는 배포마다 1 올린다.
--
-- 되돌리기:
--   alter table public.persona_results drop column if exists pipeline_version;
-- ════════════════════════════════════════════════════════════════

alter table public.persona_results
  add column if not exists pipeline_version integer not null default 1;

comment on column public.persona_results.pipeline_version is
  '생성 당시 파이프라인 버전(store.ts PIPELINE_VERSION). 캐시는 현재 버전만 히트 — 공유 링크는 버전 불문.';
