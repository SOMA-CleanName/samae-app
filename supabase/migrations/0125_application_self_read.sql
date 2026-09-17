-- ─────────────────────────────────────────────
-- 0125. 작가 신청서 — **본인도 자기 것을 읽을 수 있게.**
--
-- 지금은 정책이 하나뿐이라(is_admin()) 신청한 본인조차 자기 신청서를 못 본다.
-- 그래서 이런 일이 생겼다(2026-09-17 신고):
--
--   · 신청을 넣었는데 프로필에 [스튜디오] 가 안 뜬다
--     — 진입 조건이 "처리 전 신청이 있는가" 인데, 그 조회가 RLS 에 막혀 늘 0 이었다
--   · /studio 에 주소로 들어가도 "아직 작가로 등록되지 않았어요 · 작가 신청하기" 가 뜬다
--     — 이미 신청한 사람에게 다시 신청하라고 보내고, 가면 "이미 접수된 신청이 있어요"
--
-- 본인 신청서를 본인이 보는 건 당연하다. 쓰기는 열지 않는다 — 상태(status)는 운영이
-- 정하는 값이고, 신청자가 자기 신청을 승인으로 바꿀 수 있으면 안 된다.
--
-- ⚠️ SELECT 만 연다. 기존 admin 정책은 그대로 두 — 정책은 OR 로 합쳐지므로
--    운영자는 계속 전부 보고 쓸 수 있다.
-- ─────────────────────────────────────────────

drop policy if exists photographer_applications_self_read on public.photographer_applications;

create policy photographer_applications_self_read
  on public.photographer_applications
  for select
  using (profile_id = auth.uid());

-- 본인 조회가 인덱스를 타게 한다. 신청 건수가 적어 지금은 차이가 없지만,
-- 이 조회는 **로그인한 모든 요청**에서 돈다(getCurrentUser).
create index if not exists photographer_applications_profile_id_idx
  on public.photographer_applications (profile_id);
