-- 0105. 연락처 전달 — 작가가 보내고, 고객이 고지받고 동의한 뒤 받는다.
--
-- 왜 필요한가 (docs/32 §3-3 개정):
--   연락처가 넘어가는 순간 거래는 사매 밖에서도 이어질 수 있게 되고, 그때부터 사매는
--   무슨 일이 있었는지 추적할 수 없다. 그래서 이 전달은 **사매 중개 용역의 제공 완료**
--   지점이고, 그 시점부터 청약철회 100% 구간이 닫힌다(전자상거래법 제17조 제2항 제5호).
--   근거로 쓰려면 제13조의 사전 고지 + 동의가 기록으로 남아야 한다 — 그게 이 컬럼들이다.
--
-- 시간이 지나면 저절로 열리는 방식(구 '7일 자동 개방')은 폐기한다.
-- 저절로 열리면 고지도 동의도 기록도 없이 추적만 끊긴다.

-- 작가가 미리 등록해두는 연락 수단 — 매번 타이핑하지 않게, 그리고 무엇을 줬는지 남게
alter table public.photographers
  add column if not exists contact_methods jsonb not null default '[]'::jsonb;

comment on column public.photographers.contact_methods is
  '[{id, kind: phone|kakao_open|instagram|other, value, label?}] — 고객에게 전달할 연락 수단. docs/32 §3-3';

alter table public.bookings
  -- 작가가 보낸 시각
  add column if not exists contact_sent_at      timestamptz,
  -- 고객이 고지를 읽고 동의해 실제로 받은 시각 (= 청약철회 구간이 닫히는 시점)
  add column if not exists contact_delivered_at timestamptz,
  -- 전달 당시의 연락처 스냅샷. 작가가 나중에 프로필을 바꿔도 '무엇을 줬는지'는 남아야 한다
  add column if not exists contact_payload      jsonb;

comment on column public.bookings.contact_sent_at is
  '작가가 연락처를 보낸 시각. docs/32 §3-3';
comment on column public.bookings.contact_delivered_at is
  '고객이 고지·동의 후 수령한 시각 — 이때부터 청약철회 100% 구간이 닫힌다. docs/32 §3-3';
comment on column public.bookings.contact_payload is
  '전달 시점의 연락 수단 스냅샷 (분쟁 대응)';
