// 환불 판정 — docs/32(v2) 의 표가 그대로 통과해야 한다.
//
// 시계가 둘이라 경계도 둘이다(결제+7일 / 촬영−7일). 겹치는 구간(§1-1)이 이 정책의
// 가장 어려운 자리이므로 동의 유무까지 네 경우를 모두 못박는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { refundQuote } from "./refund";
import { resolveFee, readFeeSnapshot, feeSpecFromRow } from "./platform-fee";

const NOW = new Date("2026-09-01T12:00:00+09:00");
const iso = (d: Date) => d.toISOString();
const shift = (base: Date, ms: number) => new Date(base.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// 촬영비 100,000 + 출장비 20,000, 정률 10% → 수수료 10,000
const base = {
  amountKrw: 120000,
  travelFeeKrw: 20000,
  feeKrw: 10000,
  now: NOW,
};

test("입금 전이면 환불이 아니라 취소", () => {
  const q = refundQuote({ ...base, shootAt: iso(shift(NOW, 30 * DAY)), transferMarkedAt: null });
  assert.equal(q.basis, "not_paid");
  assert.equal(q.refundKrw, 0);
  assert.equal(q.feeWaived, true);
});

test("결제 7일 이내 · 촬영 7일 이상 → 100%, 아무도 손해 없음", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -2 * HOUR)),
  });
  assert.equal(q.basis, "withdrawal");
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeWaived, true);
  assert.equal(q.photographerNetKrw, 0); // 작가도 0 — 손실 없음
});

test("청약철회 경계는 포함 — 정확히 7일 전 결제면 아직 100%", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -7 * DAY)),
  });
  assert.equal(q.basis, "withdrawal");
});

test("결제 7일 1분 경과 → 위약금 50%", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -7 * DAY - 60_000)),
  });
  assert.equal(q.basis, "penalty_50");
  assert.equal(q.refundKrw, 60000);
  assert.equal(q.feeKrw, 10000); // 수수료는 유지
  assert.equal(q.photographerNetKrw, 50000); // 120,000 − 10,000 − 60,000
});

// ── 연락처 전달 (§3-3) ────────────────────────────────────────

test("연락처를 받으면 청약철회 기간이 남아 있어도 구간이 닫힌다", () => {
  // 중개 용역이 제공 완료된 시점이라 100% 구간이 끝난다
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -1 * HOUR)),
    contactDeliveredAt: iso(shift(NOW, -10 * 60_000)),
  });
  assert.equal(q.basis, "penalty_50");
  assert.equal(q.refundKrw, 60000);
});

test("작가가 보내기만 하고 고객이 받지 않았으면 그대로 100%", () => {
  // 보낸 사실만으로는 아무것도 달라지지 않는다 — 고지·동의를 거쳐 받아야 한다
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -1 * HOUR)),
    contactDeliveredAt: null,
  });
  assert.equal(q.basis, "withdrawal");
  assert.equal(q.percent, 100);
});

test("연락처를 받았어도 작가 귀책이면 전액 환불", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -1 * HOUR)),
    contactDeliveredAt: iso(shift(NOW, -10 * 60_000)),
    override: "photographer_fault",
  });
  assert.equal(q.refundKrw, 120000);
});

test("촬영 7일 경계는 고객 쪽으로 — 정확히 7일 남으면 위약금 50%", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 7 * DAY)),
    transferMarkedAt: iso(shift(NOW, -10 * DAY)),
  });
  assert.equal(q.basis, "penalty_50");
});

test("촬영 7일 1분 안쪽이면 위약금 100%", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 7 * DAY - 60_000)),
    transferMarkedAt: iso(shift(NOW, -10 * DAY)),
  });
  assert.equal(q.basis, "penalty_100");
  assert.equal(q.refundKrw, 0);
});

// ── 두 시계가 겹칠 때 (§1-1) ──────────────────────────────────

test("임박 예약 + 동의 없음 → 청약철회가 이긴다 (전액 환불)", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 2 * DAY)), // 촬영 임박
    transferMarkedAt: iso(shift(NOW, -1 * HOUR)), // 결제 직후
  });
  assert.equal(q.basis, "withdrawal");
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeWaived, true);
});

test("임박 예약 + 동의 있음 → 위약금 100% 를 주장할 수 있다", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 2 * DAY)),
    transferMarkedAt: iso(shift(NOW, -1 * HOUR)),
    lateBookingConsentAt: iso(shift(NOW, -1 * HOUR)),
  });
  assert.equal(q.basis, "penalty_100");
  assert.equal(q.refundKrw, 0);
});

test("동의가 있어도 촬영이 멀면 청약철회가 그대로 적용된다", () => {
  // 여유 있게 잡은 예약에 동의 기록이 남아 있어도, 촬영이 임박하지 않으면 위약금 근거가 없다
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 30 * DAY)),
    transferMarkedAt: iso(shift(NOW, -1 * HOUR)),
    lateBookingConsentAt: iso(shift(NOW, -1 * HOUR)),
  });
  assert.equal(q.basis, "withdrawal");
});

test("동의 있는 임박 예약도 청약철회 기간이 지나면 같은 결론(위약금 100%)", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 2 * DAY)),
    transferMarkedAt: iso(shift(NOW, -10 * DAY)),
    lateBookingConsentAt: iso(shift(NOW, -10 * DAY)),
  });
  assert.equal(q.basis, "penalty_100");
});

test("시각 없는 옛 예약은 그날 23:59 기준 — 경계가 고객에게 유리하게 잡힌다", () => {
  // 9/8 23:59 는 9/1 12:00 에서 7일 이상 뒤 → 위약금 50% 구간
  const q = refundQuote({
    ...base,
    shootAt: null,
    shootDate: "2026-09-08",
    transferMarkedAt: iso(shift(NOW, -10 * DAY)),
  });
  assert.equal(q.basis, "penalty_50");
});

test("작가 귀책 — 촬영 임박이어도 전액 환불하고 수수료는 작가가 문다", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 1 * DAY)),
    transferMarkedAt: iso(shift(NOW, -10 * DAY)),
    override: "photographer_fault",
  });
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeWaived, false);
  assert.equal(q.photographerNetKrw, -10000); // 수수료만큼 마이너스
});

test("천재지변 — 전액 환불에 수수료도 면제, 작가는 0", () => {
  const q = refundQuote({
    ...base,
    shootAt: iso(shift(NOW, 1 * DAY)),
    transferMarkedAt: iso(shift(NOW, -10 * DAY)),
    override: "force_majeure",
  });
  assert.equal(q.refundKrw, 120000);
  assert.equal(q.feeWaived, true);
  assert.equal(q.photographerNetKrw, 0);
});

// ── 수수료 모델 ────────────────────────────────────────────────

test("설정 없는 작가는 전역 정액 6,000", () => {
  const f = resolveFee(null, 100000);
  assert.equal(f.mode, "flat");
  assert.equal(f.feeKrw, 6000);
});

test("정률 10% 는 촬영비에만 붙는다", () => {
  const f = resolveFee({ mode: "rate", rate: 0.1 }, 100000);
  assert.equal(f.feeKrw, 10000);
  assert.equal(f.shootFeeKrw, 100000);
});

test("정률인데 요율이 비면 기본 10% 로 받는다 — 매출이 조용히 0 이 되지 않게", () => {
  assert.equal(resolveFee({ mode: "rate", rate: null }, 100000).feeKrw, 10000);
});

test("정액이 촬영비보다 크면 촬영비까지만", () => {
  assert.equal(resolveFee({ mode: "flat", amountKrw: 6000 }, 3000).feeKrw, 3000);
});

test("row → spec 변환은 numeric 문자열도 받는다", () => {
  const spec = feeSpecFromRow({ fee_mode: "rate", fee_rate: 0.15 as unknown as number });
  assert.equal(resolveFee(spec, 100000).feeKrw, 15000);
});

test("스냅샷은 깨져 있어도 화면을 죽이지 않는다", () => {
  assert.equal(readFeeSnapshot(null), null);
  assert.equal(readFeeSnapshot({ nope: 1 }), null);
  assert.equal(readFeeSnapshot({ mode: "rate", rate: 0.1, shootFeeKrw: 100000, feeKrw: 10000 })?.feeKrw, 10000);
});
