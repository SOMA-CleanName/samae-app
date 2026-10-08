-- ════════════════════════════════════════════════════════════════
-- 0147 · 검색 기록에 실패 이유 (2026-10-08)
--
--   검색이 가끔 「결과가 없어요」 로 끝났다. 맥미니 검색어 분리(/search-query)가 4초 안에 답이 없거나
--   오류가 나면 이유와 상관없이 실패로 처리됐고, 홈은 그걸 「결과 없음」 으로 보였다 — 사진이 없는 건지
--   검색이 실패한 건지 구분할 수 없었다.
--
--   이제 실패하면 06:00 사진 목록의 태그 일치만으로라도 찾고(lib/siglip-text-search), 실패 이유를 여기 남긴다.
--     timeout      맥미니가 4초 안에 답이 없었다
--     network      연결 자체가 안 됐다(맥미니 꺼짐 · Funnel · 인터넷)
--     http_NNN     맥미니가 오류 코드를 줬다(401 = 토큰 불일치, 5xx = 서버 오류)
--     bad_response 답의 꼴이 틀렸다(맥미니 · 앱 판이 안 맞음)
--     no_url       앱에 맥미니 주소가 없다(PERSONA_EMBED_URL)
--     too_long     검색어가 120자를 넘었다
--     error        검색 전체가 터졌다(태그 일치 대신 길까지 실패)
--     null         정상
--   어드민 「도구 → 검색」 에서만 보여준다.
--
--   앱은 이 칸이 없어도(0147 전) 기록을 남긴다 — 칸을 빼고 다시 넣는다(lib/search-log).
--
--   되돌리기: alter table public.search_logs drop column search_error;
-- ════════════════════════════════════════════════════════════════

alter table public.search_logs
  add column if not exists search_error text;

comment on column public.search_logs.search_error is
  '맥미니 검색어 분리 실패 이유(timeout · network · http_NNN · bad_response · no_url · too_long · error). null 이면 정상. 실패하면 태그 일치만으로 찾았다.';
