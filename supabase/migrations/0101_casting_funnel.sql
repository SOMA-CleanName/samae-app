-- ════════════════════════════════════════════════════════════════
-- 0084 · 무료 모델 모집 퍼널 (캐스팅)
--
-- 설계 근거: docs/29-model-casting-funnel.md
--
-- 이 퍼널의 목적은 "좋은 모델을 뽑는 것"이 아니라 "신청자를 유저로 전환하는 것"이다.
-- 선정은 회차당 소수고 탈락자가 다수이므로, 탈락자를 다시 서비스로 들여보내는
-- 데이터(어떤 작가를 골랐는지 · 다음 회차 알림 동의)를 신청 시점에 확보한다.
--
-- 미성년자 취급이 이 마이그레이션의 핵심 제약이고, 게이트를 두 단계로 나눈다.
--
--   [접수 시]  만 15세 미만은 차단 (근로기준법 §64 취직인허증 이슈 회피).
--              만 19세 미만은 보호자 성명·연락처를 받는다.
--
--   [선정 시]  만 19세 미만은 보호자 서명 동의서 파일이 없으면 selected 로 못 넘어간다
--              (민법 §5 — 동의 없는 미성년자의 법률행위는 취소 가능. 나중에 학부모가
--               내리라고 하면 촬영·헤메 비용을 다 쓴 마케팅 자산이 통째로 무효가 된다).
--
-- 동의서를 '접수' 시점에 강제하지 않는 이유: 인쇄→서명→스캔은 이탈률이 매우 높다.
-- 법적 위험이 실제로 발생하는 지점은 신청서 보관이 아니라 촬영·게시이므로,
-- 리드는 일단 확보하고 게이트는 선정 시점에 건다.
--
-- 두 게이트 모두 앱 로직이 아니라 DB 트리거로 박는다. 서버 액션을 우회하는 경로가
-- 생기거나 어드민이 실수해도 뚫리지 않게 하기 위함.
-- (CHECK 제약을 쓰지 않는 건 만 나이 판정에 current_date 가 필요한데
--  CHECK 는 immutable 표현식만 허용하기 때문이다.)
--
-- 적용: 운영(prod)은 Supabase SQL Editor 에 붙여넣어 실행.
-- ════════════════════════════════════════════════════════════════

-- ── 헬퍼: 만 나이 ────────────────────────────────────────────────
-- 신청 시점 나이를 컬럼에 박아두지 않는다. 촬영일에 생일이 지나 성년이 되는 경우가 있어,
-- 판정이 필요한 시점마다 birth_date 로 다시 계산한다.
create or replace function public.age_years(d date, at_date date default current_date)
returns int language sql stable as $$
  select extract(year from age(at_date, d))::int
$$;

comment on function public.age_years is '생년월일 기준 만 나이. 캐스팅 미성년 판정에 사용.';


-- ── 회차 ────────────────────────────────────────────────────────
-- 상시 모집은 긴장감이 없다. 회차제여야 "마감 D-3 · 현재 47명 신청" 같은 후크가 생기고,
-- 탈락자에게 "다음 회차"라는 재방문 명분이 생긴다.
create table if not exists public.casting_rounds (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,            -- 2026-autumn
  title         text not null,
  status        text not null default 'draft'
                check (status in ('draft', 'open', 'closed', 'selecting', 'done')),
  opens_at      timestamptz,
  closes_at     timestamptz,
  shoot_from    date,                            -- 촬영 예정 기간 (폼에 표시)
  shoot_to      date,
  capacity      int,                             -- 선정 인원 (공개 표시)
  description   text,
  hero_image_url text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_casting_rounds_status
  on public.casting_rounds (status, opens_at desc);

drop trigger if exists trg_casting_rounds_updated on public.casting_rounds;
create trigger trg_casting_rounds_updated before update on public.casting_rounds
  for each row execute function public.set_updated_at();

alter table public.casting_rounds enable row level security;

-- draft 는 공개하지 않는다. 준비 중인 회차가 노출되면 안 된다.
drop policy if exists casting_rounds_public_read on public.casting_rounds;
create policy casting_rounds_public_read on public.casting_rounds
  for select using (status <> 'draft');

drop policy if exists casting_rounds_admin on public.casting_rounds;
create policy casting_rounds_admin on public.casting_rounds
  for all using (public.is_admin()) with check (public.is_admin());


-- ── 회차별 참여 작가 ─────────────────────────────────────────────
-- 승인 작가 전체를 STEP 2 에 노출하면 안 된다. 참여 의사를 밝히지 않은 작가에게
-- 신청이 몰리면 배정이 불가능해진다. 회차마다 참여 작가를 명시적으로 등록한다.
create table if not exists public.casting_round_photographers (
  round_id        uuid not null references public.casting_rounds(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  sort_order      int not null default 0,
  slots           int,                           -- 이 작가가 받을 수 있는 모델 수 (null = 미지정)
  created_at      timestamptz not null default now(),
  primary key (round_id, photographer_id)
);

create index if not exists idx_casting_round_photographers_round
  on public.casting_round_photographers (round_id, sort_order);

alter table public.casting_round_photographers enable row level security;

-- 공개 회차의 참여 작가 목록은 신청 폼에서 읽어야 하므로 공개 read.
drop policy if exists casting_round_photographers_public_read on public.casting_round_photographers;
create policy casting_round_photographers_public_read on public.casting_round_photographers
  for select using (
    exists (select 1 from public.casting_rounds r where r.id = round_id and r.status <> 'draft')
  );

drop policy if exists casting_round_photographers_admin on public.casting_round_photographers;
create policy casting_round_photographers_admin on public.casting_round_photographers
  for all using (public.is_admin()) with check (public.is_admin());


-- ── 신청 ────────────────────────────────────────────────────────
create table if not exists public.casting_applications (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.casting_rounds(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'new'
                check (status in ('new', 'shortlisted', 'selected', 'rejected', 'withdrawn')),

  -- 신청자
  name          text not null,
  phone         text not null,
  birth_date    date not null,                   -- 미성년 분기의 유일한 근거
  gender        text,                            -- 선택 입력
  region        text not null,                   -- 촬영 가능 지역

  -- 희망 사항 — preferred_photographer_ids 가 이 퍼널의 온보딩 장치이자
  -- 탈락 통지에서 "당신이 고른 작가" 링크를 만드는 근거다. 비면 안 된다.
  preferred_photographer_ids uuid[] not null default '{}',
  mood_tags     text[] not null default '{}',
  concept_note  text,

  -- 사진 (private storage 경로)
  photo_paths   text[] not null default '{}',

  -- 동의 — 항목을 쪼갠다. 하나로 묶으면 포괄동의라 법적으로 취약하고,
  -- SNS 게시를 거절하면 신청 자체를 못 하게 되어 접수율도 떨어진다.
  -- (기존 albums.ad_consent 가 backfill 과 실제 동의를 구분 못 해 공식 계정 발행이
  --  막혀 있는 것과 같은 실수를 반복하지 않기 위함)
  consent_participate boolean not null default false,
  consent_sns         boolean not null default false,
  consent_paid_ad     boolean not null default false,
  consent_credit      boolean not null default false,

  -- 미성년 (만 19세 미만일 때만 채워짐)
  guardian_name          text,
  guardian_phone         text,
  guardian_relation      text,
  guardian_consent_path  text,                   -- 서명 동의서 스캔/촬영본

  -- 유입 · 재접촉
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  landing_path  text,
  notify_next_round boolean not null default true,

  -- 심사
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id) on delete set null,
  reject_reason text,                            -- 내부 메모. 신청자에게 노출하지 않는다.

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- ── 날짜와 무관한 제약은 CHECK 로 ──────────────────────────────
  -- 참여 동의 없이는 신청이 성립하지 않는다.
  constraint casting_app_participate_required
    check (consent_participate),

  -- 작가를 고르지 않으면 온보딩 장치가 무력화된다. 1~3명.
  constraint casting_app_photographer_pick
    check (cardinality(preferred_photographer_ids) between 1 and 3)
);


-- ── 연령 게이트 (트리거) ─────────────────────────────────────────
-- 만 나이 판정에 current_date 가 필요해 CHECK 로는 표현할 수 없다.
create or replace function public.casting_application_age_gate()
returns trigger language plpgsql as $$
declare
  age int := public.age_years(new.birth_date);
begin
  -- [접수 게이트] 만 15세 미만 차단
  if age < 15 then
    raise exception '만 15세 이상부터 신청하실 수 있어요.'
      using errcode = 'check_violation';
  end if;

  -- [접수 게이트] 미성년이면 보호자에게 연락할 수단은 반드시 확보한다
  if age < 19 then
    if new.guardian_name is null or length(btrim(new.guardian_name)) = 0
       or new.guardian_phone is null or length(btrim(new.guardian_phone)) = 0 then
      raise exception '미성년자는 보호자 성명과 연락처가 필요해요.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- [선정 게이트] 미성년은 보호자 서명 동의서 없이 선정될 수 없다.
  -- 어드민 UI 에서도 버튼을 비활성화하지만, 최종 방어선은 여기다.
  if new.status = 'selected' and age < 19
     and (new.guardian_consent_path is null or length(btrim(new.guardian_consent_path)) = 0) then
    raise exception '미성년 신청자는 보호자 동의서가 등록되어야 선정할 수 있어요.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_casting_applications_age_gate on public.casting_applications;
create trigger trg_casting_applications_age_gate
  before insert or update on public.casting_applications
  for each row execute function public.casting_application_age_gate();

-- 한 회차당 한 계정 1건 (철회는 제외 — 철회 후 재신청 허용)
drop index if exists uniq_casting_application_round_profile;
create unique index uniq_casting_application_round_profile
  on public.casting_applications (round_id, profile_id)
  where status <> 'withdrawn';

create index if not exists idx_casting_applications_round
  on public.casting_applications (round_id, status, created_at desc);

create index if not exists idx_casting_applications_profile
  on public.casting_applications (profile_id, created_at desc);

-- 어드민 "⚠️동의서 미비" 필터용 — 보호자 연락처는 있는데 서명본이 아직 없는 건.
-- (미성년만 guardian_name 이 채워지므로 이 조건이 곧 "미성년 + 동의서 대기" 다)
create index if not exists idx_casting_applications_guardian_pending
  on public.casting_applications (round_id)
  where guardian_name is not null and guardian_consent_path is null;

drop trigger if exists trg_casting_applications_updated on public.casting_applications;
create trigger trg_casting_applications_updated before update on public.casting_applications
  for each row execute function public.set_updated_at();

alter table public.casting_applications enable row level security;

-- 본인은 자기 신청만 조회 (/casting/my). 수정·삽입은 서버(service_role)가 한다 —
-- 미성년 검증과 회차 개방 여부를 서버에서 한 번 더 확인해야 하기 때문.
drop policy if exists casting_applications_own_read on public.casting_applications;
create policy casting_applications_own_read on public.casting_applications
  for select using (profile_id = auth.uid());

drop policy if exists casting_applications_admin on public.casting_applications;
create policy casting_applications_admin on public.casting_applications
  for all using (public.is_admin()) with check (public.is_admin());


-- ── 대기열 ──────────────────────────────────────────────────────
-- 회차가 닫혀 있을 때 들어온 트래픽을 버리지 않는다. 탈락자도 여기로 들어온다.
create table if not exists public.casting_waitlist (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  source      text,                              -- closed_round | rejected | organic
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists uniq_casting_waitlist_profile
  on public.casting_waitlist (profile_id);

create index if not exists idx_casting_waitlist_pending
  on public.casting_waitlist (created_at)
  where notified_at is null;

alter table public.casting_waitlist enable row level security;

drop policy if exists casting_waitlist_own_read on public.casting_waitlist;
create policy casting_waitlist_own_read on public.casting_waitlist
  for select using (profile_id = auth.uid());

drop policy if exists casting_waitlist_admin on public.casting_waitlist;
create policy casting_waitlist_admin on public.casting_waitlist
  for all using (public.is_admin()) with check (public.is_admin());


-- ── Storage ─────────────────────────────────────────────────────
-- private 이어야 한다. 보호자 동의서에는 미성년자와 보호자의 실명·연락처·서명이 들어간다.
-- 열람은 어드민이 요청할 때 단기 서명 URL 로만. 정책을 두지 않아 anon/authenticated 는 접근 불가.
insert into storage.buckets (id, name, public)
values ('samae-casting', 'samae-casting', false)
on conflict (id) do nothing;


comment on table public.casting_rounds is
  '무료 모델 모집 회차. draft 는 비공개.';
comment on table public.casting_round_photographers is
  '회차별 참여 작가 — 상호 무페이. STEP 2 작가 선택지의 소스.';
comment on table public.casting_applications is
  '캐스팅 신청. 만15세미만 차단·미성년 보호자동의서 필수를 DB 제약으로 강제한다.';
comment on column public.casting_applications.preferred_photographer_ids is
  '희망 작가 1~3명. 신청을 탐색 온보딩으로 만들고, 탈락 통지의 전환 링크 근거가 된다.';
comment on column public.casting_applications.reject_reason is
  '내부 메모. 신청자에게 노출하지 않는다.';
comment on table public.casting_waitlist is
  '다음 회차 알림 대기열 — 마감 중 유입과 탈락자를 담는다.';
