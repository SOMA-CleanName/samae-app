-- 0076 · 문의 만료 상태
-- new(미해제) 상태로 7일이 지나면 만료 처리한다.
-- 만료되면 작가의 '받은 문의' 목록(status='new' 필터)에서 빠지고,
-- '수락 대기' 알림도 자동으로 감춰진다(lib/notifications 가 status != 'new' 를 필터).
-- 실제 전이는 매일 Vercel Cron(/api/cron/expire-inquiries)이 수행 — lib/inquiry-expiry.
--
-- 상태(stage):
--   new              : 접수 (작가 미수락)
--   accepted         : 입금대기 (해제 신청 후 운영자 확인 전)
--   confirmed        : 입금확인 (연락처 공개)
--   shot             : 촬영완료
--   refund_requested : 환불신청
--   expired          : 만료 (new 로 7일 경과)

alter table public.inquiries
  add column if not exists expired_at timestamptz;

-- 만료 기준 시각 — '마지막으로 new 가 된 시각'. 접수 시엔 created_at 과 같지만,
-- 작가가 해제 신청을 취소(accepted → new)하면 그 시점으로 갱신돼 7일이 다시 시작된다.
alter table public.inquiries
  add column if not exists new_since timestamptz;
update public.inquiries set new_since = created_at where new_since is null;
alter table public.inquiries
  alter column new_since set default now(),
  alter column new_since set not null;

alter table public.inquiries drop constraint if exists inquiries_status_check;
alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('new', 'accepted', 'confirmed', 'shot', 'refund_requested', 'expired'));

comment on column public.inquiries.expired_at is
  'INQUIRY_EXPIRE_DAYS(7일) 내 미해제로 만료된 시각. status=expired 와 함께 기록된다.';
comment on column public.inquiries.new_since is
  '마지막으로 status=new 가 된 시각. 만료 판정 기준(해제 신청 취소 시 갱신 → 7일 재시작).';

-- 만료 스윕용 — new 인 행만 new_since 로 스캔
create index if not exists idx_inquiries_new_since
  on public.inquiries (new_since)
  where status = 'new';
