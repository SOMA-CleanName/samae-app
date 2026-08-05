-- 0069 · 포트폴리오 등록 보완 — 요청 무드 + 사매 광고 사용 동의
--
--  · 무드(탐색 카테고리) 선택은 '선택'으로 완화 — 필수는 촬영 종류(타겟)뿐.
--  · 원하는 무드가 목록에 없으면 작가가 직접 적어 남긴다. 이건 카테고리를 만들지 않고
--    '요청'으로만 쌓이며, 운영자가 어느 포트폴리오에 무엇을 원하는지 보고 판단한다.
--  · 사매 광고 소재로 써도 되는지 작가 동의를 포트폴리오 단위로 받는다.

alter table public.albums
  add column if not exists requested_moods text[] not null default '{}',
  add column if not exists ad_consent      boolean not null default false,
  add column if not exists ad_consent_at   timestamptz;

comment on column public.albums.requested_moods is
  '작가가 직접 적은 희망 무드(카테고리 미생성). 운영자 검토용 요청 목록.';
comment on column public.albums.ad_consent is
  '사매 광고 소재로 이 포트폴리오 사진을 사용해도 되는지에 대한 작가 동의.';

-- 요청이 있는 포트폴리오만 빠르게 훑기 위한 부분 인덱스
create index if not exists idx_albums_requested_moods
  on public.albums using gin (requested_moods)
  where requested_moods <> '{}';

create index if not exists idx_albums_ad_consent
  on public.albums (ad_consent)
  where ad_consent;
