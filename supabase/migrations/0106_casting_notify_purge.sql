-- ════════════════════════════════════════════════════════════════
-- 0089 · 캐스팅 3청크 — 결과 통지 기록 · 개인정보 파기 근거
--
-- 두 가지를 남긴다.
--
--  1) notified_at — 결과를 통지한 시각.
--     결과는 회차 단위로 한 번에 보낸다(개별 발송은 형평성 논란이 생긴다).
--     일괄 발송 버튼을 두 번 눌러도 이미 보낸 사람에게 또 가지 않게 하는 근거이기도 하다.
--
--  2) purged_at — 사진·보호자 동의서를 파기한 시각.
--     기획서 별첨 A 와 /casting/consent 에 "종료 후 파기" 라고 약속했다.
--     약속을 코드로 지키기 위한 것이고, 파기 완료를 증명하는 기록이기도 하다.
--     미선정자의 사진·동의서는 결과 통지 후 30일 뒤 지운다.
--     (선정자는 촬영·게시가 남아 있으므로 회차가 done 이 될 때까지 유지)
--
-- 적용: 0084~0088 이후. 운영(prod)은 Supabase SQL Editor 또는 psql.
-- ════════════════════════════════════════════════════════════════

alter table public.casting_applications
  add column if not exists notified_at timestamptz,
  add column if not exists purged_at   timestamptz;

comment on column public.casting_applications.notified_at is
  '결과 통지 시각. 회차 단위 일괄 발송의 중복 방지 근거.';
comment on column public.casting_applications.purged_at is
  '사진·보호자 동의서 파기 시각. 미선정자는 통지 30일 뒤 파기한다(동의서에 한 약속).';

-- 파기 배치가 훑을 대상 — 통지했고 아직 안 지운 건
create index if not exists idx_casting_applications_purge_due
  on public.casting_applications (notified_at)
  where purged_at is null and notified_at is not null;

-- 일괄 통지 대상 — 아직 통지 안 한 건
create index if not exists idx_casting_applications_unnotified
  on public.casting_applications (round_id)
  where notified_at is null;
