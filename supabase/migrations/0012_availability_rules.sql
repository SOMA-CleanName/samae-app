-- ════════════════════════════════════════════════════════════════
-- 0012 · 작가 주간 가능시간 규칙 + 특정일 차단 (개별 슬롯 방식 대체)
--
-- 배경(2026-06-04 결정): 작가는 "주 단위 반복" 가능시간을 설정하고, 특정 시간대를
-- 막을 수 있다. 예약이 수락(체결)되면 그 시간은 자동으로 막힌다. 고객은 날짜를
-- 고르면 그 날의 빈 시간(패키지 소요시간 단위)을 선택한다.
--
--   - availability_rules  : 요일별 반복 가능시간 (weekday + 시작/종료 시각)
--   - availability_blocks : 특정 일시 차단 구간 (규칙보다 우선)
--   - bookings.duration_min : 예약이 점유하는 시간(분) 스냅샷 → 충돌 검사용
-- 기존 public.availability(개별 슬롯)·bookings.availability_id 는 더 이상 사용 안 함.
-- ════════════════════════════════════════════════════════════════

-- 요일별 반복 가능시간 (0=일 .. 6=토)
create table public.availability_rules (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6),
  start_time      time not null,
  end_time        time not null,
  created_at      timestamptz not null default now(),
  check (start_time < end_time)
);
create index idx_avail_rules_ph on public.availability_rules (photographer_id, weekday);

alter table public.availability_rules enable row level security;
create policy avail_rules_select on public.availability_rules for select using (true);
create policy avail_rules_write on public.availability_rules for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

-- 특정 일시 차단 (규칙 위에 덮어쓰는 예외)
create table public.availability_blocks (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  check (start_at < end_at)
);
create index idx_avail_blocks_ph on public.availability_blocks (photographer_id, start_at);

alter table public.availability_blocks enable row level security;
create policy avail_blocks_select on public.availability_blocks for select using (true);
create policy avail_blocks_write on public.availability_blocks for all
  using (public.is_my_photographer(photographer_id) or public.is_admin())
  with check (public.is_my_photographer(photographer_id) or public.is_admin());

-- 예약 점유 시간(분) 스냅샷
alter table public.bookings add column if not exists duration_min integer;

grant select, insert, update, delete on public.availability_rules  to anon, authenticated;
grant select, insert, update, delete on public.availability_blocks to anon, authenticated;
