-- ════════════════════════════════════════════════════════════════
-- 0003 · 포트폴리오 Storage 버킷 + 정책
--
-- 버킷: samae-portfolio (공개 읽기)
--  · 사진 업로드/삭제는 서버 라우트가 service_role 로 수행(소유권 검증 후)
--    → 클라이언트 write 정책은 두지 않음(기본 거부)
--  · 공개 읽기 정책만 추가 (탐색 갤러리에서 public URL 사용)
-- ════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('samae-portfolio', 'samae-portfolio', true)
on conflict (id) do nothing;

-- 공개 읽기 (anon/authenticated 모두 select 가능)
drop policy if exists "portfolio public read" on storage.objects;
create policy "portfolio public read"
  on storage.objects for select
  using (bucket_id = 'samae-portfolio');
