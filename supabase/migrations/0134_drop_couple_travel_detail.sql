-- ════════════════════════════════════════════════════════════════
-- 0134 · 커플 세부분류 "여행·신혼여행" 을 뺀다 (2026-09-18)
--
-- 0133 자동 초안에서 커플 "여행" 6개는 전부 사진으로만 정했고, 검수해 보니 커플 스냅과 가르기 어려웠다.
-- 세부분류에서 뺀다. 이미 들어간 값은 커플 스냅으로 바꾼다(남는 선택지가 스냅·기념일뿐이고 여행은 추측이었다).
-- "신혼여행"·"허니문" 검색어는 계속 커플로 잡되 세부분류로 좁히지 않는다(query_parse.py).
--
-- 순서가 중요하다 — 값을 먼저 바꾸고 허용 키를 줄인다. 허용 키 함수를 바꿔도 CHECK 는 기존 행을
-- 다시 검사하지 않으므로, 먼저 줄이면 여행 값이 남은 행이 다음 수정 때 CHECK 에 걸린다.
--
-- 되돌리기: 0133 의 purpose_detail_keys() 를 다시 실행(값은 커플 스냅으로 남는다)
-- ════════════════════════════════════════════════════════════════

update public.albums
   set admin_purpose_details = array_replace(admin_purpose_details, 'couple.travel', 'couple.snap')
 where 'couple.travel' = any(admin_purpose_details);
update public.photos
   set admin_purpose_details = array_replace(admin_purpose_details, 'couple.travel', 'couple.snap')
 where 'couple.travel' = any(admin_purpose_details);
-- 스냅이 이미 있던 행은 트리거(keep_details_of_purposes)가 중복을 한 번으로 줄인다.

create or replace function public.purpose_detail_keys()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'personal.snap', 'personal.profile', 'personal.body_profile', 'personal.id_photo',
    'couple.snap', 'couple.anniversary', 'friendship.snap', 'friendship.siblings',
    'wedding.ceremony', 'wedding.shoot', 'wedding.remind', 'pet.dog',
    'pet.cat', 'pet.other', 'commercial.brand', 'commercial.lookbook',
    'commercial.product', 'commercial.business_profile', 'commercial.food_space', 'event.maternity',
    'event.baby', 'event.first_birthday', 'event.family', 'event.graduation',
    'event.group', 'event.banquet'
  ]::text[];
$$;
