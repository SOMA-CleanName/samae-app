-- 동의 기록 — 회원약관 동의, 작가 입점 계약 동의, 작가 사업자 정보 (docs/35 P2).
--
-- 지금까지는 "가입하면 동의한 것으로 본다" 는 문구만 있고 기록이 없었다. 약관은 게시해야 효력이
-- 생기고, 동의는 기록이 있어야 주장할 수 있다. 어떤 버전에 언제 동의했는지를 남긴다.

-- 1) 회원약관·개인정보처리방침 동의 (회원약관 3조·5조)
alter table public.profiles
  add column if not exists terms_agreed_at timestamptz,
  add column if not exists terms_version   text;

comment on column public.profiles.terms_agreed_at is '회원 이용약관·개인정보처리방침에 동의한 시각. null 이면 동의 화면(/signup/consent)을 거친다';
comment on column public.profiles.terms_version is '동의 당시 약관 버전 (lib/policy-version.ts TERMS_VERSION)';

-- 2) 작가 사업자 정보 (수수료정책 1조 2항·6조, 입점계약 작가 정보란)
--    원천징수용 식별정보(주민등록번호)는 두지 않는다 — 정책 확인 후 결정 (docs/35 6장 6번).
alter table public.photographers
  add column if not exists legal_name        text,
  add column if not exists business_type     text,
  add column if not exists business_no       text,
  add column if not exists promo_consent     boolean not null default false,
  add column if not exists promo_consent_at  timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'photographers_business_type_check') then
    alter table public.photographers
      add constraint photographers_business_type_check
      check (business_type is null or business_type in ('general', 'simplified', 'unregistered'));
  end if;
end $$;

comment on column public.photographers.legal_name is '성명 또는 상호 — 입점 계약 당사자 표시. 활동명(display_name)과 별개';
comment on column public.photographers.business_type is 'general 일반과세자 | simplified 간이과세자 | unregistered 사업자 미등록 (원천징수 3.3% 대상)';
comment on column public.photographers.promo_consent is '입점계약 7조 홍보 사용 동의 (전체). 앨범 단위 ad_consent 는 이 아래에서 개별 적용';

-- 3) 작가 입점 계약 동의 로그 (album_ad_consent_logs 와 같은 모양 — 버전·시각·행위자)
create table if not exists public.photographer_agreements (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  -- {terms, fee, refund, contract} 각 문서의 버전. 어느 하나라도 올라가면 다시 동의를 받는다
  versions        jsonb not null,
  promo_consent   boolean not null default false,
  ip              text,
  user_agent      text,
  agreed_at       timestamptz not null default now()
);

create index if not exists idx_photographer_agreements_ph
  on public.photographer_agreements (photographer_id, agreed_at desc);

alter table public.photographer_agreements enable row level security;

-- 작가 본인만 자기 동의 기록을 본다. 쓰기는 service_role (서버 액션) 만.
drop policy if exists photographer_agreements_select on public.photographer_agreements;
create policy photographer_agreements_select on public.photographer_agreements
  for select using (
    exists (
      select 1 from public.photographers p
      where p.id = photographer_agreements.photographer_id and p.profile_id = auth.uid()
    )
  );

comment on table public.photographer_agreements is
  '작가 입점 계약 동의 이력. 최신 행의 versions 가 현재 버전과 다르면 스튜디오 진입 시 다시 동의를 받는다 (studio/layout.tsx)';
