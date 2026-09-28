-- 0135. 리드 모델의 마지막 DB 잔재 — 트리거 둘을 걷는다 (2026-09-19)
--
-- 리드 모델은 "작가가 문의(리드)를 열려면 사매 계좌에 단가를 입금한다" 였다. 거래가
-- 예약 에스크로(고객이 촬영비 전액을 사매 계좌로)로 바뀌면서 이 구조는 끝났고,
-- 어드민의 단가 설정 화면·액션과 입금 확인 버튼도 제거했다.
--
-- 그런데 **DB 쪽은 아직 돌고 있었다.**
--
--   trg_inquiry_deposit_amount  — 문의가 하나 들어올 때마다 죽은 단가를
--                                 inquiries.deposit_amount_krw 에 찍는다.
--                                 읽는 코드는 이제 없다. 값만 쌓인다.
--   trg_photographers_lead_price_guard — lead_price_krw 를 서비스 역할 밖에서
--                                 못 바꾸게 막는 가드. 쓰는 곳이 없어 지킬 것도 없다.
--
-- 남기는 것
--   · inquiries.deposit_amount_krw · deposit_confirmed_at · deposit_confirmed_by
--   · photographers.lead_price_krw
--   · platform_account.default_lead_price_krw
--
--   지난 리드 18건(누계 244,000원)의 근거다. 컬럼을 지우면 "그때 얼마를 받았나" 에
--   답할 수 없게 된다. 트리거만 멈추면 새 행에는 더 이상 값이 찍히지 않는다.
--
-- ⚠️ platform_account 의 나머지 칸(bank·number·holder·notice)은 **지금도 쓰인다.**
--    그게 고객이 촬영비를 넣는 사매 에스크로 계좌다(lib/platform-account → lib/payments).
--    이 표를 통째로 지우면 안 된다.

-- 새 문의에 단가를 찍지 않는다
drop trigger if exists trg_inquiry_deposit_amount on public.inquiries;
drop function if exists public.set_inquiry_deposit_amount();

-- 아무도 쓰지 않는 값을 지키던 가드
drop trigger if exists trg_photographers_lead_price_guard on public.photographers;
drop function if exists public.guard_photographer_lead_price();

comment on column public.inquiries.deposit_amount_krw is
  '[폐지] 리드 단가 스냅샷. 2026-09-19 트리거 제거 — 새 행에는 찍히지 않는다. 지난 기록 보존용';
comment on column public.photographers.lead_price_krw is
  '[폐지] 리드 단가. 2026-09-19 이후 읽는 코드 없음. 지난 기록 보존용';
comment on column public.platform_account.default_lead_price_krw is
  '[폐지] 기본 리드 단가. 같은 표의 bank·number·holder·notice 는 에스크로 계좌로 계속 쓰인다';
