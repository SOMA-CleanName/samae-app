-- 정산 원천징수 — 사업자 미등록 작가에게 지급할 때 뗀 세금을 남긴다
--
-- 왜 컬럼으로 남기나. 정산액(settlement_amount_krw)만 남기면 "왜 이 금액인가" 를 나중에
-- 재현할 수 없다. 요율·수수료·사업자 유형은 그 사이에 바뀔 수 있어서, 지급 시점의 계산을
-- 그대로 붙잡아 두지 않으면 지급명세서를 만들 때도 정산 문의가 왔을 때도 답을 못 한다.
--
-- 근거: 소득세법 제127조(원천징수의무자 = 지급하는 자), 제129조(세율 3%),
--       지방세법 제103조의13(지방소득세 특별징수 0.3%), 제164조(지급명세서 제출).
--       계산은 src/lib/withholding.ts 한 곳에서만 한다.

alter table public.bookings
  -- 뗀 총액 (사업소득세 + 지방소득세). 사업자 작가는 0
  add column if not exists withholding_krw integer not null default 0,
  -- 지급 시점의 계산 전체 {baseKrw, incomeTaxKrw, localTaxKrw, totalKrw, reason,
  --                        feeKrw, vatKrw, businessType, settlementKrw}
  add column if not exists settlement_breakdown jsonb;

comment on column public.bookings.withholding_krw is
  '정산 시 원천징수한 총액(사업소득세 3% + 지방소득세 0.3%). 사업자 등록 작가는 0';
comment on column public.bookings.settlement_breakdown is
  '지급 시점의 정산 계산 스냅샷. 지급명세서와 정산 문의의 근거 — 나중에 요율이 바뀌어도 재현된다';
