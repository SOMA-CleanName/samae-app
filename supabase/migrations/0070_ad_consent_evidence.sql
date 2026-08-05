-- 0070 · 광고 소재 사용 동의 — 증적 강화
--
-- 문구가 바뀌면 "그때 동의한 내용은 이게 아니었다"에 반박할 수 없으므로,
-- 동의한 문구의 버전을 함께 박고 동의/철회를 로그로 남긴다(철회해도 이력 보존).

alter table public.albums
  add column if not exists ad_consent_version text;

comment on column public.albums.ad_consent_version is
  '동의한 광고 사용 문구의 버전(lib/ad-consent.ts AD_CONSENT_VERSION). 철회 시에도 마지막 값 유지.';

-- 동의·철회 이력 — albums 의 현재 상태와 별개로 시점·버전·행위자를 남긴다.
create table if not exists public.album_ad_consent_logs (
  id           uuid primary key default gen_random_uuid(),
  album_id     uuid not null references public.albums(id) on delete cascade,
  consented    boolean not null,
  version      text,
  actor        uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_aacl_album
  on public.album_ad_consent_logs (album_id, created_at desc);

alter table public.album_ad_consent_logs enable row level security;

-- 조회는 그 앨범의 작가 본인 또는 운영자. 쓰기는 서버(service_role)만 — 정책 없이 차단.
drop policy if exists aacl_select on public.album_ad_consent_logs;
create policy aacl_select on public.album_ad_consent_logs
  for select using (
    public.is_admin() or exists (
      select 1
      from public.albums a
      join public.photographers p on p.id = a.photographer_id
      where a.id = album_id and p.profile_id = auth.uid()
    )
  );
