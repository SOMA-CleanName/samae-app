-- 취소환불정책 1.0 · 수수료정산정책 1.0 반영 (docs/35).
--
-- 무엇이 바뀌나
--   · 위약금이 3단(100/50/0)에서 4단(0/40/90/노쇼 100)으로. 판정은 lib/refund.ts.
--   · 위약금은 작가 80 : 사매 20 으로 나눈다. 그 결과를 예약에 숫자로 남긴다.
--   · 수수료 기본이 정액 6,000원에서 정률 20%(부가세 별도)로.
--   · 예약 확정 시점의 정책 버전을 남긴다 — 나중에 규정이 바뀌어도 지난 예약은 그때 규정으로.
--
-- 기존 예약은 fee_snapshot 이 있어 요율 변경의 소급 영향이 없다.
-- refund_reason 에 남아 있는 옛 basis 값(penalty_50, contact_delivered, penalty_100)은
-- 그대로 둔다 — 화면은 REFUND_BASIS_LABEL 로 읽는다.

alter table public.bookings
  add column if not exists refund_krw               integer,   -- 고객에게 돌려준 금액
  add column if not exists penalty_krw              integer,   -- 위약금 총액
  add column if not exists penalty_photographer_krw integer,   -- 위약금 중 작가 몫 (80%)
  add column if not exists penalty_company_krw      integer,   -- 위약금 중 사매 몫 (20%)
  add column if not exists fee_claim_krw            integer,   -- 작가 귀책 시 작가에게 청구하는 수수료 상당액
  add column if not exists policy_snapshot          jsonb;     -- 확정 시점의 약관·정책 버전

comment on column public.bookings.penalty_krw is
  '취소환불정책 4조 위약금. 작가 80 : 사매 20 으로 나눈 값이 옆 두 열이다 (13조, 수수료정책 10조)';
comment on column public.bookings.fee_claim_krw is
  '작가 사정 취소 시 작가에게 청구하는 중개 수수료 상당액 (취소환불 8조 2항, 수수료 8조)';
comment on column public.bookings.policy_snapshot is
  '입금 확인 시점의 {terms, refund, fee, at}. lib/policy-version.ts';

-- 수수료 기본값: 정액 → 정률 20%.
-- 정액을 직접 설정한 작가(fee_amount_krw 가 있는 행)는 그대로 둔다.
-- 설정이 비어 있던 작가(fee_mode='flat' and fee_amount_krw is null)는 기본값을 따르던 것이므로 정률로 옮긴다.
update public.photographers
   set fee_mode = 'rate', fee_rate = 0.2000
 where fee_mode = 'flat' and fee_amount_krw is null;

alter table public.photographers
  alter column fee_mode set default 'rate',
  alter column fee_rate set default 0.2000;

comment on column public.photographers.fee_mode is
  'rate(기본, 촬영 대금 전체 × fee_rate, 부가세 별도) | flat(옛 모델, fee_amount_krw 정액)';

-- 구간 예고 알림 표시 — 40% 는 기존 notice_penalty_at 을 쓰고, 90% 는 새 열.
-- notice_withdrawal_at 은 더 이상 쓰지 않는다(청약철회 마감은 돈이 갈리지 않아 알리지 않는다). 열은 남긴다.
alter table public.bookings
  add column if not exists notice_penalty_90_at timestamptz;

comment on column public.bookings.notice_penalty_at is '촬영 8일 전 "내일부터 위약금 40%" 알림 발송 시각';
comment on column public.bookings.notice_penalty_90_at is '촬영 4일 전 "내일부터 위약금 90%" 알림 발송 시각';

-- 취소 신청에 환불 계좌를 함께 받는다 (취소환불 11조 2항 — 결제한 수단으로 돌려준다).
-- 고객은 사매 계좌로 이체했으므로 돌려줄 계좌를 물어야 한다. {bank, number, holder}
alter table public.support_requests
  add column if not exists refund_account jsonb;

comment on column public.support_requests.refund_account is
  '취소 신청 시 고객이 적은 환불 계좌 {bank, number, holder}. 어드민 환불 처리 화면에서 읽는다';
