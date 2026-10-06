-- ════════════════════════════════════════════════════════════════
-- 0146 · 검색 기록에 걸린 시간 (2026-10-06)
--
--   검색 한 번에 몇 ms 걸렸나 — 홈 검색(searchHomePhotos)의 시작부터 결과가 나올 때까지.
--   검색은 맥미니 검색어 분리(4초 제한)와 DB 를 거쳐서, 느려지면 사용자는 빈 화면을 오래 본다.
--   어드민 「도구 → 검색」 에서만 보여준다(평균 · 느린 검색 · 검색어별 최대). 사용자 화면에는 안 나간다.
--
--   null — 이 칸이 생기기 전 기록, 또는 시간을 못 잰 기록.
--   앱은 이 칸이 없어도(0146 전) 기록을 남긴다 — 칸을 빼고 다시 넣는다(lib/search-log).
--
--   되돌리기: alter table public.search_logs drop column duration_ms;
-- ════════════════════════════════════════════════════════════════

alter table public.search_logs
  add column if not exists duration_ms integer check (duration_ms is null or duration_ms >= 0);

comment on column public.search_logs.duration_ms is
  '검색 한 번에 걸린 시간(ms) — 홈 검색 시작부터 결과까지. 어드민 「도구 → 검색」 전용.';
