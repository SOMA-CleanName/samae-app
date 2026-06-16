-- 0038 · 분석 이벤트에 UTM/유입 컬럼 추가 (카테고리별 광고 추적)
alter table public.analytics_events
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists landing_path text;

create index if not exists idx_analytics_utm
  on public.analytics_events (utm_source, utm_campaign, created_at desc);
