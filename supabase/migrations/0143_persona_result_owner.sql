-- ─────────────────────────────────────────────
-- 0143. 분석 결과에 주인을 남긴다.
--
-- 로그인해야 분석되게 바뀌면서(2026-10-06 이벤트 비용 가드) 비로소 "누가 어떤 페르소나로
-- 나왔는지" 를 알 수 있게 됐다. 그 전에는 username_hash 뿐이라 역추적이 불가능했고,
-- 분석만 하고 사라진 사람과 가입한 사람을 구분할 방법이 없었다.
--
-- 쓰임: 작가 추천·리타게팅, 그리고 "분석 → 문의" 전환을 사람 단위로 보는 것.
--
-- ⚠️ 여전히 **인스타 아이디 원본은 저장하지 않는다.** username_hash 는 그대로 해시다.
--    여기 들어가는 건 우리 서비스의 회원 id 뿐이다.
-- ⚠️ nullable 이다. 공유 링크로 들어온 옛 결과·업로드 분석에는 주인이 없을 수 있고,
--    로그인 게이트 배포 이전 결과는 전부 null 이다.
-- ─────────────────────────────────────────────

alter table public.persona_results
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

comment on column public.persona_results.profile_id is
  '분석을 돌린 회원. 로그인 게이트(2026-10-06) 이후 결과에만 있다. 삭제되면 결과는 남고 주인만 끊긴다.';

-- "이 회원의 최근 분석" 을 찾는 조회 — 주인이 있는 행만 센다(대부분은 null 이라 부분 인덱스)
create index if not exists persona_results_profile_idx
  on public.persona_results (profile_id, created_at desc)
  where profile_id is not null;
