-- ════════════════════════════════════════════════════════════════
-- 0046 · 작가 공개 프로필 아바타 노출
--
-- 아바타는 profiles.avatar_url 에 저장되는데, profiles 는 RLS 상
-- 본인(또는 admin)만 조회 가능하다(phone 등 민감정보 포함). 그래서
-- 남이 보는 공개 작가 프로필에서는 아바타가 안 보였다.
-- 승인된 작가의 avatar_url 한 필드만 SECURITY DEFINER 함수로 노출한다.
-- (찜 수 0010 과 동일 패턴)
-- ════════════════════════════════════════════════════════════════

create or replace function public.photographer_avatar_url(pid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pr.avatar_url
  from public.photographers ph
  join public.profiles pr on pr.id = ph.profile_id
  where ph.id = pid and ph.status = 'approved';
$$;

grant execute on function public.photographer_avatar_url(uuid) to anon, authenticated;
