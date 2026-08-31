-- ════════════════════════════════════════════════════════════════
-- 0085 · 2026 가을 캐스팅 1회차 시드
--
-- 상호 무페이 — 작가도 모델도 돈을 주고받지 않고 양쪽 다 결과물을 가져간다.
-- 참여 작가 4명 × 작가당 2명 = 선정 8명.
--
-- status 는 'draft' 로 넣는다. 공개 시점에 어드민에서 'open' 으로 바꾼다
-- (draft 는 RLS 에서 공개 read 가 막혀 있어 준비 중 노출 사고가 나지 않는다).
--
-- 적용: 운영(prod)은 Supabase SQL Editor 에 붙여넣어 실행. 0084 이후에 실행할 것.
-- ════════════════════════════════════════════════════════════════

insert into public.casting_rounds
  (slug, title, status, shoot_from, shoot_to, capacity, description)
values (
  '2026-autumn',
  '2026 가을 시즌 모델 모집',
  'draft',
  '2026-10-10',
  '2026-11-08',
  8,
  '단풍이 가장 예쁜 2주, 사매 작가님들과 무료로 가을 스냅을 찍습니다. '
  || '촬영 원본과 보정본은 전부 드리고 사용 제한도 없어요. '
  || '작가님들도 작품을 위해 무보수로 참여합니다.'
)
on conflict (slug) do nothing;

-- 참여 작가 — display_name 으로 찾아 연결한다.
-- (핸들 컬럼이 없어 표시명이 유일한 식별 수단. 표시명이 바뀌면 이 시드는 다시 맞춰야 한다.)
insert into public.casting_round_photographers (round_id, photographer_id, sort_order, slots)
select r.id, p.id, x.ord, 2
from public.casting_rounds r
cross join (values
  ('kiwi_film',     1),   -- 키위
  ('Fadin’ Photo',  2),   -- fadin
  ('무루필름',        3),
  ('Frame Ryu',     4)    -- filmm.ryu
) as x(name, ord)
join public.photographers p
  on p.display_name = x.name and p.status = 'approved'
where r.slug = '2026-autumn'
on conflict (round_id, photographer_id) do nothing;

-- 검증: 4명이 다 붙었는지 확인한다. 표시명이 하나라도 어긋나면 여기서 멈춘다.
do $$
declare n int;
begin
  select count(*) into n
  from public.casting_round_photographers crp
  join public.casting_rounds r on r.id = crp.round_id
  where r.slug = '2026-autumn';

  if n <> 4 then
    raise exception '참여 작가가 4명이어야 하는데 %명이 연결됐어요. photographers.display_name 을 확인하세요.', n;
  end if;
end $$;
