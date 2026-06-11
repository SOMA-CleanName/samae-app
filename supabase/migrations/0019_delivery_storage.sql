-- ─────────────────────────────────────────────
-- 0019. 보정본 전달 — 비공개 스토리지 + 외부 링크 보조
--
-- 작가가 보정본(유료 결과물)을 앱 내에서 전달한다.
--   · samae-delivery: 비공개 버킷(public=false). 원본 경로로 직접 접근 불가.
--     업로드는 service_role(admin), 다운로드는 서버가 만료형 서명 URL을 발급.
--     → 구매자만 받게 하는 게이트는 서버(참여자 검증)가 담당하므로
--       storage public read 정책을 두지 않는다.
--   · deliveries.external_link: 대용량/RAW는 작가가 외부 링크(드라이브 등)로 보조 전달.
-- ─────────────────────────────────────────────

-- 비공개 버킷 (이미 있으면 유지)
insert into storage.buckets (id, name, public)
values ('samae-delivery', 'samae-delivery', false)
on conflict (id) do nothing;

-- 외부 링크 보조 컬럼
alter table public.deliveries
  add column if not exists external_link text;
