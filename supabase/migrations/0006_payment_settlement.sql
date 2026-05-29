-- ════════════════════════════════════════════════════════════════
-- 0006 · 결제·정산 멱등성 보강
-- payments/settlements 테이블은 0001에 존재. 여기서는 webhook 중복 수신
-- 방어를 위한 멱등 인덱스만 추가한다. (write 는 모두 service_role 전용)
-- ════════════════════════════════════════════════════════════════

-- PG 거래 ID 중복 방지 (webhook 재전송 멱등). NULL(미결제 prepare 단계)은 제외.
create unique index if not exists uq_payments_pg_tx_id
  on public.payments (pg_tx_id)
  where pg_tx_id is not null;
