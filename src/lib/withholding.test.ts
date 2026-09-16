import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWithholding, isWithholdingTarget } from "./withholding";

test("미등록 작가 — 3% + 0.3%, 10원 미만은 버린다", () => {
  const w = computeWithholding(300_000, "unregistered");
  assert.equal(w.incomeTaxKrw, 9_000); // 300,000 × 3%
  assert.equal(w.localTaxKrw, 900); // 9,000 × 10%
  assert.equal(w.totalKrw, 9_900);
});

test("10원 미만 절사 — 딱 떨어지지 않는 금액", () => {
  // 123,456 × 3% = 3,703.68 → 3,700
  const w = computeWithholding(123_456, "unregistered");
  assert.equal(w.incomeTaxKrw, 3_700);
  // 3,700 × 10% = 370
  assert.equal(w.localTaxKrw, 370);
  assert.equal(w.totalKrw, 4_070);
});

test("일반과세자는 떼지 않는다 — 세금계산서로 처리된다", () => {
  const w = computeWithholding(300_000, "general");
  assert.equal(w.totalKrw, 0);
  assert.match(w.reason, /세금계산서/);
});

test("간이과세자도 떼지 않는다", () => {
  assert.equal(computeWithholding(300_000, "simplified").totalKrw, 0);
});

test("사업자 정보가 없으면 떼지 않는다 — 근거 없는 공제를 만들지 않는다", () => {
  assert.equal(computeWithholding(300_000, null).totalKrw, 0);
  assert.equal(computeWithholding(300_000, undefined).totalKrw, 0);
});

test("소액부징수 — 소득세가 1,000원 미만이면 전액 0 (소득세법 86조)", () => {
  // 33,333 × 3% = 999.99 → 990 < 1,000
  const w = computeWithholding(33_333, "unregistered");
  assert.equal(w.totalKrw, 0);
  assert.match(w.reason, /소액부징수/);
});

test("소액부징수 경계 — 33,340원이면 소득세 1,000원이라 징수한다", () => {
  const w = computeWithholding(33_340, "unregistered");
  assert.equal(w.incomeTaxKrw, 1_000);
  assert.equal(w.localTaxKrw, 100);
  assert.equal(w.totalKrw, 1_100);
});

test("소액부징수 바로 아래 — 33,330원은 소득세 990원이라 떼지 않는다", () => {
  assert.equal(computeWithholding(33_330, "unregistered").totalKrw, 0);
});

test("음수나 0 은 0 으로 본다", () => {
  assert.equal(computeWithholding(-5000, "unregistered").totalKrw, 0);
  assert.equal(computeWithholding(0, "unregistered").totalKrw, 0);
});

test("과세표준은 넘긴 값 그대로 남는다 — 정산 내역서가 근거로 쓴다", () => {
  assert.equal(computeWithholding(300_000, "unregistered").baseKrw, 300_000);
  assert.equal(computeWithholding(300_000, "general").baseKrw, 300_000);
});

test("원천징수 대상 판정 — 미등록만", () => {
  assert.equal(isWithholdingTarget("unregistered"), true);
  assert.equal(isWithholdingTarget("general"), false);
  assert.equal(isWithholdingTarget("simplified"), false);
  assert.equal(isWithholdingTarget(null), false);
});
