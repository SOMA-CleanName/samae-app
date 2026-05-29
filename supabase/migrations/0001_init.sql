-- ════════════════════════════════════════════════════════════════
-- samae 초기 스키마 (v1) — docs/04-database-schema.md 구현
--
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--       또는 supabase CLI: `supabase db push`
--
-- 설계 원칙
--  · public 스키마 (samae 전용 신규 프로젝트)
--  · 모든 테이블 RLS 활성화 — 기본 거부, 정책으로 허용
--  · role = user|admin 만. "작가 여부"는 photographers(approved) 행 존재로 판단
--  · 돈·상태를 바꾸는 작업(예약 전이·결제·정산)은 service_role 서버 경로 only
-- ════════════════════════════════════════════════════════════════

-- ⚠️ language sql 보조 함수(is_admin 등)가 아직 안 만들어진 테이블을 참조하므로
--    생성 시점 본문 검증을 끈다. (런타임 호출 시점엔 테이블이 존재하므로 안전)
set check_function_bodies = off;

-- ─────────────────────────────────────────────
-- 1. Enum 타입
-- ─────────────────────────────────────────────
create type user_role           as enum ('user', 'admin');
create type photographer_status as enum ('pending', 'approved', 'suspended', 'rejected');
create type booking_status       as enum (
  'requested', 'accepted', 'paid', 'shot', 'delivered',
  'completed', 'rejected', 'cancelled', 'refunded'
);
create type payment_status       as enum (
  'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partial_refunded'
);
create type settlement_status    as enum ('pending', 'scheduled', 'paid', 'held');
create type message_type         as enum ('text', 'image', 'system');
create type notification_type    as enum ('chat', 'booking', 'payment', 'settlement', 'review', 'system');
create type photo_visibility     as enum ('published', 'draft', 'archived');

-- ─────────────────────────────────────────────
-- 2. 공통 함수
-- ─────────────────────────────────────────────

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 가입 시 profiles 행 자동 생성 (auth.users 트리거)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- RLS 보조 함수 (SECURITY DEFINER — 정책 내 재귀/권한 우회용)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_my_photographer(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.photographers where id = pid and profile_id = auth.uid());
$$;

create or replace function public.is_conversation_participant(conv uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv
      and (c.user_id = auth.uid()
           or exists (select 1 from public.photographers p
                      where p.id = c.photographer_id and p.profile_id = auth.uid()))
  );
$$;

create or replace function public.is_booking_participant(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.bookings bk
    where bk.id = b
      and (bk.user_id = auth.uid()
           or exists (select 1 from public.photographers p
                      where p.id = bk.photographer_id and p.profile_id = auth.uid()))
  );
$$;

-- ─────────────────────────────────────────────
-- 3. 테이블
-- ─────────────────────────────────────────────

-- 3.1 profiles : auth.users 1:1 확장
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         user_role not null default 'user',
  display_name text,
  avatar_url   text,
  phone        text,                         -- 민감정보 (추후 암호화 고려)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 3.2 photographers : 작가 자격·공개 프로필 (profiles 1:1)
create table public.photographers (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null unique references public.profiles(id) on delete cascade,
  handle             text not null unique,
  status             photographer_status not null default 'pending',
  display_name       text,
  bio                text not null default '',
  regions            text[] not null default '{}',
  mood_tags          text[] not null default '{}',
  price_from_krw     integer not null default 0,
  hero_photo_id      uuid,                    -- FK는 photos 생성 후 추가
  rating_avg         numeric(2,1) not null default 0,
  review_count       integer not null default 0,
  settlement_account jsonb,                   -- 정산 계좌 (민감 — 추후 암호화)
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3.3 packages : 작가 판매 상품
create table public.packages (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name            text not null,
  description     text not null default '',
  duration_min    integer not null default 60,
  edited_count    integer not null default 10,
  price_krw       integer not null,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 3.4 photos : 포트폴리오/탐색 갤러리 소스
create table public.photos (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  storage_path    text not null,
  src_url         text not null,
  thumb_url       text,
  width           integer not null default 0,
  height          integer not null default 0,
  mood_tags       text[] not null default '{}',
  region          text,
  visibility      photo_visibility not null default 'draft',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- photographers.hero_photo_id → photos (순환참조 회피 위해 이제 추가)
alter table public.photographers
  add constraint photographers_hero_photo_fk
  foreign key (hero_photo_id) references public.photos(id) on delete set null;

-- 3.5 favorites : 유저 찜
create table public.favorites (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('photographer', 'photo')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (profile_id, target_type, target_id)
);

-- 3.6 bookings : 거래의 단일 진실 (상태머신 — docs/05)
create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete restrict,
  photographer_id  uuid not null references public.photographers(id) on delete restrict,
  package_id       uuid references public.packages(id) on delete set null,
  status           booking_status not null default 'requested',
  shoot_at         timestamptz,
  location_text    text,
  amount_krw       integer,
  package_snapshot jsonb,                     -- 예약 당시 패키지 내용 보존
  memo             text not null default '',
  cancel_reason    text,
  requested_at     timestamptz not null default now(),
  accepted_at      timestamptz,
  paid_at          timestamptz,
  shot_at          timestamptz,
  delivered_at     timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 3.7 conversations : 유저↔작가 1:1
create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  photographer_id     uuid not null references public.photographers(id) on delete cascade,
  booking_id          uuid references public.bookings(id) on delete set null,
  last_message_at     timestamptz,
  user_unread         integer not null default 0,
  photographer_unread integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, photographer_id)
);

-- 3.8 messages
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  type            message_type not null default 'text',
  body            text not null default '',
  image_path      text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- 3.9 availability : 작가 가능 시간 슬롯
create table public.availability (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  is_booked       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- 3.10 payments : 유저 결제 (예약 1:1)
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings(id) on delete restrict,
  status          payment_status not null default 'pending',
  provider        text,
  pg_tx_id        text,
  amount_krw      integer not null,
  refunded_krw    integer not null default 0,
  idempotency_key text unique,
  raw             jsonb,                       -- PG 응답 원본 (감사)
  paid_at         timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 3.11 settlements : 작가 정산 (예약 1:1)
create table public.settlements (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings(id) on delete restrict,
  photographer_id uuid not null references public.photographers(id) on delete restrict,
  gross_krw       integer not null,
  fee_krw         integer not null default 0,
  net_krw         integer not null,
  status          settlement_status not null default 'pending',
  scheduled_at    timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 3.12 deliveries : 보정본 전달
create table public.deliveries (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references public.bookings(id) on delete cascade,
  asset_paths  text[] not null default '{}',
  expires_at   timestamptz,
  confirmed_at timestamptz,                    -- 유저 전달 확인 → 정산 트리거
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 3.13 reviews : 1예약 1후기
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  rating          integer not null check (rating between 1 and 5),
  body            text not null default '',
  created_at      timestamptz not null default now()
);

-- 3.14 notifications
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         notification_type not null,
  title        text not null,
  body         text not null default '',
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 4. 인덱스
-- ─────────────────────────────────────────────
create index idx_photographers_status   on public.photographers (status);
create index idx_packages_photographer  on public.packages (photographer_id, is_active);
create index idx_photos_visibility       on public.photos (visibility, region);
create index idx_photos_mood             on public.photos using gin (mood_tags);
create index idx_photos_photographer     on public.photos (photographer_id);
create index idx_favorites_profile       on public.favorites (profile_id);
create index idx_bookings_photographer   on public.bookings (photographer_id, status);
create index idx_bookings_user           on public.bookings (user_id, status);
create index idx_bookings_shoot          on public.bookings (shoot_at);
create index idx_messages_conversation   on public.messages (conversation_id, created_at);
create index idx_availability_pg          on public.availability (photographer_id, start_at);
create index idx_settlements_pg           on public.settlements (photographer_id, status);
create index idx_reviews_photographer     on public.reviews (photographer_id);
create index idx_notifications_recipient  on public.notifications (recipient_id, read_at);

-- ─────────────────────────────────────────────
-- 5. updated_at 트리거
-- ─────────────────────────────────────────────
create trigger trg_profiles_updated      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger trg_photographers_updated  before update on public.photographers  for each row execute function public.set_updated_at();
create trigger trg_packages_updated       before update on public.packages       for each row execute function public.set_updated_at();
create trigger trg_photos_updated         before update on public.photos         for each row execute function public.set_updated_at();
create trigger trg_bookings_updated       before update on public.bookings       for each row execute function public.set_updated_at();
create trigger trg_conversations_updated  before update on public.conversations  for each row execute function public.set_updated_at();
create trigger trg_payments_updated       before update on public.payments       for each row execute function public.set_updated_at();
create trigger trg_settlements_updated    before update on public.settlements    for each row execute function public.set_updated_at();
create trigger trg_deliveries_updated     before update on public.deliveries     for each row execute function public.set_updated_at();

-- 가입 시 profiles 자동 생성
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- 6. 후기 집계 트리거 (rating_avg / review_count 갱신)
-- ─────────────────────────────────────────────
create or replace function public.refresh_photographer_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.photographer_id, old.photographer_id);
begin
  update public.photographers p
  set review_count = sub.cnt,
      rating_avg    = coalesce(sub.avg_rating, 0)
  from (
    select count(*)::int as cnt, round(avg(rating)::numeric, 1) as avg_rating
    from public.reviews where photographer_id = pid
  ) sub
  where p.id = pid;
  return null;
end;
$$;

create trigger trg_reviews_aggregate
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_photographer_rating();

-- ─────────────────────────────────────────────
-- 7. RLS 활성화
-- ─────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.photographers  enable row level security;
alter table public.packages       enable row level security;
alter table public.photos         enable row level security;
alter table public.favorites      enable row level security;
alter table public.bookings       enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.availability   enable row level security;
alter table public.payments       enable row level security;
alter table public.settlements    enable row level security;
alter table public.deliveries     enable row level security;
alter table public.reviews        enable row level security;
alter table public.notifications  enable row level security;

-- ─────────────────────────────────────────────
-- 8. RLS 정책
--   ※ payments/settlements/notifications write 및 bookings update 는
--     클라이언트 정책을 두지 않음 → service_role(서버) 만 수행
-- ─────────────────────────────────────────────

-- profiles
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- photographers
create policy photographers_select on public.photographers for select
  using (status = 'approved' or profile_id = auth.uid() or public.is_admin());
create policy photographers_insert on public.photographers for insert
  with check (profile_id = auth.uid());
create policy photographers_update on public.photographers for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- packages
create policy packages_select on public.packages for select
  using (is_active = true or public.is_my_photographer(photographer_id) or public.is_admin());
create policy packages_write on public.packages for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

-- photos
create policy photos_select on public.photos for select
  using (visibility = 'published' or public.is_my_photographer(photographer_id) or public.is_admin());
create policy photos_write on public.photos for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

-- favorites (본인만)
create policy favorites_all on public.favorites for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- bookings (참여자 조회 / 유저 생성 / 전이는 서버 only)
create policy bookings_select on public.bookings for select
  using (user_id = auth.uid() or public.is_my_photographer(photographer_id) or public.is_admin());
create policy bookings_insert on public.bookings for insert
  with check (user_id = auth.uid());

-- conversations (참여자)
create policy conversations_select on public.conversations for select
  using (user_id = auth.uid() or public.is_my_photographer(photographer_id) or public.is_admin());
create policy conversations_insert on public.conversations for insert
  with check (user_id = auth.uid() or public.is_my_photographer(photographer_id));
create policy conversations_update on public.conversations for update
  using (user_id = auth.uid() or public.is_my_photographer(photographer_id));

-- messages (대화 참여자)
create policy messages_select on public.messages for select
  using (public.is_conversation_participant(conversation_id));
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and public.is_conversation_participant(conversation_id));

-- availability (공개 조회 / 작가 본인 관리)
create policy availability_select on public.availability for select using (true);
create policy availability_write on public.availability for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

-- payments (참여자 조회만, write 는 service_role)
create policy payments_select on public.payments for select
  using (public.is_booking_participant(booking_id) or public.is_admin());

-- settlements (작가 본인 조회만)
create policy settlements_select on public.settlements for select
  using (public.is_my_photographer(photographer_id) or public.is_admin());

-- deliveries (참여자 조회, write 는 서버/업로드 경로)
create policy deliveries_select on public.deliveries for select
  using (public.is_booking_participant(booking_id) or public.is_admin());

-- reviews (공개 조회 / 본인 작성·수정)
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert
  with check (user_id = auth.uid());
create policy reviews_update on public.reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications (본인만)
create policy notifications_select on public.notifications for select
  using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (recipient_id = auth.uid());

-- ─────────────────────────────────────────────
-- 9. 권한 (RLS가 행 접근을 게이트, 아래는 테이블 레벨 grant)
-- ─────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
