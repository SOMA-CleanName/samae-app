-- 0031 · 문의 수락 상태
-- 작가가 예약 문의를 수락하면 예약 알림에서 빠지고 예약 목록에 쌓인다.

alter table public.inquiries
  add column if not exists accepted_at timestamptz;

alter table public.inquiries
  drop constraint if exists inquiries_status_check;

alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('new', 'accepted', 'contacted', 'converted', 'closed'));

create index if not exists idx_inquiries_accepted
  on public.inquiries (photographer_id, accepted_at)
  where status = 'accepted';
