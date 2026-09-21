-- 신규 입점 작가 중개 수수료 18% (2026-09-21 결정). 그전 20%.
--
-- 이미 입점한 작가는 행에 적힌 요율을 그대로 쓴다 — 기본값만 바뀐다.
-- 2026-09-21 실측: 정률 10% 15명(실제 작가), 정률 20% 2명(개발자 계정, 아래에서 18% 로). 실제 작가 요율을 바꾸는 건 별도 결정(작가약관 12조 3항)이다.
--
-- 코드 쪽 기본값(lib/platform-fee.ts DEFAULT_FEE_RATE)과 같은 값이어야 한다.

-- 요율이 비어 있는 정률 작가가 있다면, 기본값을 바꾸기 전에 지금까지 적용되던 20% 를 명시해 둔다.
-- (코드가 빈 요율을 DEFAULT_FEE_RATE 로 받기 때문에, 이걸 안 하면 그 작가만 조용히 18% 가 된다)
-- 0101 의 check 제약상 rate 모드는 fee_rate 가 null 일 수 없으므로 보통 0행이다 — 안전장치일 뿐.
update public.photographers
   set fee_rate = 0.2000
 where fee_mode = 'rate' and fee_rate is null;

alter table public.photographers
  alter column fee_rate set default 0.1800;

-- 0111 이후 기본값 20% 로 입점한 2행(2026-09-21 실측, 둘 다 개발자 계정)을 신규 기준 18% 로 맞춘다.
-- 실제 작가는 전원 10% 라 이 문장의 영향을 받지 않는다. 20% 는 사람이 손으로 넣은 값이 아니라
-- 기본값이 박힌 것이므로, 기본값을 옮기면서 같이 옮긴다.
update public.photographers
   set fee_rate = 0.1800
 where fee_mode = 'rate' and fee_rate = 0.2000;

comment on column public.photographers.fee_rate is
  'rate 모드의 요율(0.1800 = 18%). 촬영 대금 전체(촬영비+출장비+추가금)에 적용, 부가세 별도. 기본 18% 는 2026-09-21 신규 입점부터. 초기 작가 15명은 0.1000';
