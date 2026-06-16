-- 0029 · 로그인/비로그인 공용 문의 접수
-- 채팅을 쓰지 않는 예약·문의 진입에서 고객 연락 수단과 상담 정보를 저장한다.

create table if not exists public.inquiries (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references public.profiles(id) on delete set null,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  source_photo_id uuid references public.photos(id) on delete set null,
  phone          text,
  instagram_id   text,
  discord_id     text,
  contact_email  text,
  gender         text,
  party_size     int,
  purpose        text not null,
  preferred_date text not null,
  region         text not null,
  note           text,
  status         text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (
    phone is not null
    or instagram_id is not null
    or discord_id is not null
    or contact_email is not null
  )
);

create index if not exists idx_inquiries_photographer
  on public.inquiries (photographer_id, status, created_at desc);
create index if not exists idx_inquiries_profile
  on public.inquiries (profile_id, created_at desc)
  where profile_id is not null;

drop trigger if exists trg_inquiries_updated on public.inquiries;
create trigger trg_inquiries_updated
  before update on public.inquiries
  for each row execute function public.set_updated_at();

alter table public.inquiries enable row level security;
