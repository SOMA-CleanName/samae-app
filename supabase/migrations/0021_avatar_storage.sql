-- ─────────────────────────────────────────────
-- 0021. 프로필 아바타 스토리지 (공개 읽기)
--
-- 사용자가 계정 설정에서 프로필 사진(아바타)을 올릴 수 있게 한다.
-- 아바타는 채팅·예약 등에 노출되므로 공개 읽기. 업로드는 서버(service_role)가
-- 본인 검증 후 처리하므로 storage write 정책은 두지 않는다.
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('samae-avatar', 'samae-avatar', true)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read"
  on storage.objects for select
  using (bucket_id = 'samae-avatar');
