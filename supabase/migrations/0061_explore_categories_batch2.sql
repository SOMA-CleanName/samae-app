-- 0061 · 탐색 편집형 카테고리 2차 추가 (운영 큐레이션 목록)
--
-- 운영이 정한 카테고리 목록을 추가한다. slug 는 영문 자동 생성(기존 0060 시드와 미충돌).
-- 부제(subtitle)는 전부 생략, published=false 로 시작 — 사진 담고 준비되면 어드민에서 공개.
-- (원본 목록의 '데이트' 중복은 1건으로, '영화 속 우리 / 인상적인 포즈'는 2건으로 분리)

insert into public.explore_categories (slug, title, sort) values
  ('studio-wedding',   '스튜디오 웨딩',   1010),
  ('outdoor-wedding',  '야외 웨딩 스냅',  1020),
  ('casual-wedding',   '캐주얼 웨딩',     1030),
  ('date',             '데이트',          1040),
  ('dress',            '드레스',          1050),
  ('wedding-ceremony', '본식',            1060),
  ('bright-mood',      '밝은 분위기',     1070),
  ('dreamy-mood',      '아련한 분위기',   1080),
  ('vintage-memories', '빈티지 추억',     1090),
  ('our-vibe',         '우리만의 느낌',   1100),
  ('school-uniform',   '교복',            1110),
  ('studio',           '스튜디오',        1120),
  ('movie-scene',      '영화 속 우리',    1130),
  ('striking-pose',    '인상적인 포즈',   1140),
  ('vintage-look',     '빈티지',          1150),
  ('profile-image',    '프로필 이미지',   1160),
  ('natural-look',     '자연스러움',      1170),
  ('unique-mood',      '이색적인 분위기', 1180),
  ('chic',             '시크',            1190),
  ('dramatic-mood',    '극적인 분위기',   1200),
  ('film',             '필름',            1210),
  ('greenery',         '푸르른 초목',     1220),
  ('city',             '도시',            1230),
  ('daily-life',       '일상',            1240)
on conflict (slug) do nothing;
