-- 주민등록번호 — 원천징수·지급명세서용 (소득세법 제127조·제164조)
--
-- ⚠️ **고유식별정보다.** 개인정보보호법 제24조의2 상 법령 근거가 있을 때만 처리할 수 있고,
--    제24조 제3항에 따라 **암호화 보관이 의무**다. 0112 에서 "정책 확인 후 결정" 으로
--    미뤄 뒀던 항목을 여기서 연다.
--
-- 왜 필요한가: 사업자 미등록 작가에게 정산할 때 3.3%를 원천징수하고 지급명세서를 내야
-- 하는데 그 서류에 주민번호가 들어간다. **사업자 등록을 한 작가(일반·간이)에게는 받지
-- 않는다** — 세금계산서로 처리되어 원천징수 대상이 아니고, 근거 없는 수집이 된다.

alter table public.photographers
  -- AES-256-GCM 암호문. 형식 `v1.<iv>.<tag>.<ct>` (lib/resident-no.ts). **평문 컬럼은 없다.**
  add column if not exists resident_no_enc     text,
  -- 화면·목록·어드민이 쓰는 값. 뒤 6자리는 여기에도 남지 않는다 (001010-3******)
  add column if not exists resident_no_masked  text,
  add column if not exists resident_no_at      timestamptz;

comment on column public.photographers.resident_no_enc is
  '주민등록번호 AES-256-GCM 암호문(v1.iv.tag.ct). 복호화는 지급명세서 생성 시에만, 접근 로그 필수';
comment on column public.photographers.resident_no_masked is
  '마스킹 표시용(001010-3******). 화면·목록·어드민은 이 값만 쓴다';
comment on column public.photographers.resident_no_at is
  '수집 시각. 사업자 유형이 바뀌면 세 컬럼을 모두 null 로 파기한다(법 제21조)';

-- ── 복호화 접근 로그 ────────────────────────────────────────────
-- 누가·언제·왜 열었는지 남기지 않으면 "목적 외 이용이 없었다" 를 증명할 수 없다.
-- 유출 사고가 났을 때 범위를 좁히는 것도 이 표뿐이다.
create table if not exists public.resident_no_access_logs (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  -- 연 사람 (어드민 profiles.id). 시스템 배치면 null
  actor_id        uuid references public.profiles(id) on delete set null,
  -- 왜 열었는가 — 자유 문자열이 아니라 호출부가 고정 값을 넣는다
  purpose         text not null,
  ip              text,
  user_agent      text,
  accessed_at     timestamptz not null default now()
);

create index if not exists idx_resident_access_ph
  on public.resident_no_access_logs (photographer_id, accessed_at desc);
create index if not exists idx_resident_access_actor
  on public.resident_no_access_logs (actor_id, accessed_at desc);

alter table public.resident_no_access_logs enable row level security;
-- 읽기도 service_role 만. 작가 본인에게도 열지 않는다 — 본인 것이어도 "누가 열어봤나" 는
-- 운영 기록이라 열람 범위를 넓히면 그 자체가 새로운 노출면이 된다.

comment on table public.resident_no_access_logs is
  '주민등록번호 복호화 접근 기록. 목적 외 이용이 없었음을 증명하는 유일한 근거';
