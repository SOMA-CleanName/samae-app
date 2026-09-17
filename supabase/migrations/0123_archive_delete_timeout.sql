-- 아카이브 삭제 함수에 **시간을 넉넉히 준다.**
--
-- 0122 에서 인덱스를 깔아 회원 탈퇴가 8초 넘게 걸리던 걸 4.9초까지 줄였다. 그런데도
-- 아슬아슬하다 — 캐시가 차가운 첫 호출은 여전히 8초를 넘겼다(실측).
--
-- 8초가 어디서 오는지가 핵심이다. PostgREST 는 `authenticator` 로 접속한 뒤 SET ROLE 로
-- service_role 이 된다. 제한은 **접속 시점의 역할**에 걸려 있다 —
--
--   authenticator | statement_timeout=8s, lock_timeout=8s
--
-- 그래서 service_role 에 아무 설정이 없어도(= DB 기본 2분처럼 보여도) 실제로는 8초다.
-- 이걸 착각하면 "타임아웃일 리가 없다" 는 잘못된 결론에 빠진다. 실제로 그랬다.
--
-- 역할 설정을 건드리지 않는 이유: 그러면 **모든 API 요청**의 상한이 올라간다. 8초는
-- 느린 쿼리가 커넥션을 물고 늘어지는 걸 막는 안전장치라 그대로 두는 게 맞다.
-- 대신 오래 걸리는 게 정상인 이 두 함수에만 예외를 준다. 함수에 건 SET 은 호출하는
-- 동안만 적용되고 끝나면 세션 값으로 되돌아온다.
--
-- 60초로 잡은 근거: 지금 가장 무거운 계정(어드민 초기화를 여러 번 돌려 deleted_records
-- 아카이브가 2만 건 넘게 쌓인 계정)이 5초다. 10배 여유면 데이터가 한참 늘어도 버틴다.
-- 무한정(0)으로 두지 않는 건, 잘못된 조건으로 테이블 전체를 지우려는 호출이 몇 분씩
-- 락을 잡고 있는 편이 실패하는 것보다 나쁘기 때문이다.

alter function public.admin_archive_delete_where(text, text, text[], uuid)
  set statement_timeout = '60s';

alter function public.admin_archive_delete_all(text[], uuid)
  set statement_timeout = '60s';
