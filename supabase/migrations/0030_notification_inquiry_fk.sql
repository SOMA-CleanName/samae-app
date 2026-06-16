-- 0030 · 알림과 문의 FK 연결
-- 작가 알림에서 어떤 문의(inquiries)를 가리키는지 명확히 추적한다.

alter table public.notifications
  add column if not exists inquiry_id uuid references public.inquiries(id) on delete set null;

create index if not exists idx_notifications_inquiry
  on public.notifications (inquiry_id)
  where inquiry_id is not null;
