-- ════════════════════════════════════════════════════════════════
-- 0087 · 2026 가을 캐스팅 1회차에서 kiwi_film 제외
--
-- 배경: kiwi_film(작가 본인 계정)이 2026-08-28 23:13~23:14 사이 20초 동안
--       자신의 앨범 9개·사진 217장을 전부 삭제했다. 현재 공개 사진 0장.
--
--       STEP 2 가 "사진 고르기" 라 포트폴리오가 없는 작가는 그리드에 나올 방법이 없다.
--       명단에만 남겨두면 회차 소개의 "참여 작가 N명" 숫자만 부풀고 실제로는 고를 수 없다.
--
-- 정원도 함께 줄인다: 남은 3명 × 작가당 2슬롯 = 6명.
-- (capacity 8 로 두면 어드민 심사 화면에 "선정 x / 8" 로 뜨는데 실제 슬롯은 6이라 어긋난다)
--
-- 되돌리려면: 0085 의 insert 를 kiwi_film 만 다시 실행하고 capacity 를 8 로 되돌리면 된다.
-- 사진 217장은 deleted_records 에 남아 있어 복구 가능하다.
--
-- 적용: 0085 이후. 운영(prod)은 Supabase SQL Editor 또는 psql.
-- ════════════════════════════════════════════════════════════════

delete from public.casting_round_photographers crp
using public.casting_rounds r, public.photographers p
where crp.round_id = r.id
  and crp.photographer_id = p.id
  and r.slug = '2026-autumn'
  and p.display_name = 'kiwi_film';

update public.casting_rounds
set capacity = (
  select coalesce(sum(crp.slots), 0)
  from public.casting_round_photographers crp
  where crp.round_id = casting_rounds.id
)
where slug = '2026-autumn';

-- 검증 — 참여 작가 3명 / 정원 6명이 되어야 한다
do $$
declare n int; cap int;
begin
  select count(*), max(r.capacity) into n, cap
  from public.casting_round_photographers crp
  join public.casting_rounds r on r.id = crp.round_id
  where r.slug = '2026-autumn';

  if n <> 3 or cap <> 6 then
    raise exception '참여 작가 3명 / 정원 6명이어야 하는데 %명 / 정원 % 입니다.', n, cap;
  end if;
end $$;
