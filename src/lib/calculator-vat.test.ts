import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VAT,
  monthlyVat,
  unitEconomics,
  type UnitInput,
  type VatSettings,
} from "./calculator-vat.ts";

const near = (a: number, b: number, eps = 0.5) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b} 가 아님`);

const base = (vat: Partial<VatSettings> = {}): UnitInput => ({
  shoot: 150000,
  takePct: 10,
  pgOn: false,
  pgPct: 3.3,
  ratePct: 33,
  cpa: 11529,
  vat: { ...DEFAULT_VAT, ...vat },
});

test("VAT 를 끄면 세전 계산과 정확히 같다", () => {
  const r = unitEconomics(base({ on: false }));
  near(r.feeSupply, 15000);
  near(r.acq, 11529 / 0.33);
  near(r.pl, 15000 - 11529 / 0.33);
  assert.equal(r.outputVat, 0);
  assert.equal(r.vatPerShoot, 0);
});

test("수수료가 VAT 포함이면 매출은 1/1.1 로 줄고 그만큼이 매출세액", () => {
  const r = unitEconomics(base());
  near(r.billedFee, 15000);
  near(r.feeSupply, 15000 / 1.1);
  near(r.outputVat, 15000 - 15000 / 1.1);
  // 광고비도 공제되므로 획득비용은 공급가액 기준
  near(r.acq, 11529 / 1.1 / 0.33);
});

test("PG 수수료는 매입세액 공제 — 순수수료에서 공급가액만 빠진다", () => {
  const off = unitEconomics(base());
  const on = unitEconomics({ ...base(), pgOn: true });
  near(on.pgBilled, 150000 * 0.033);
  near(on.pgSupply, (150000 * 0.033) / 1.1);
  near(on.pgInputVat, 150000 * 0.033 - (150000 * 0.033) / 1.1);
  near(on.netFee, off.netFee - on.pgSupply);
});

test("PG 매입세액을 공제하지 않으면 청구액 전체가 순수수료에서 빠진다", () => {
  const input = { ...base({ pgDeductible: false }), pgOn: true };
  const r = unitEconomics(input);
  const billed = 150000 * 0.033;
  near(r.pgSupply, billed);
  assert.equal(r.pgInputVat, 0);
  // 공제할 때보다 순수수료가 부가세만큼 더 깎인다
  const deducted = unitEconomics({ ...base(), pgOn: true });
  near(r.netFee, deducted.netFee - (billed - billed / 1.1));
});

test("중개 구조에서는 작가 증빙이라는 개념 자체가 없다", () => {
  // 작가는 고객에게 촬영을 판 것이지 우리에게 판 게 아니다.
  // 그래서 증빙 수취율을 0 으로 놔도 우리 세금은 한 푼도 달라지지 않는다.
  const a = unitEconomics(base({ model: "brokerage", proofPct: 0 }));
  const b = unitEconomics(base({ model: "brokerage", proofPct: 100 }));
  assert.equal(a.structureCost, 0);
  assert.equal(a.payoutInputVat, 0);
  near(a.pl, b.pl, 0.01);
  // 우리 매출세액은 수수료분뿐
  near(a.outputVat, 15000 - 15000 / 1.1);
});

test("판매자로 잡히면 매출세액이 촬영비 전액에 붙는다", () => {
  const r = unitEconomics(base({ model: "reseller" }));
  near(r.outputVat, 150000 - 150000 / 1.1);
  const brokerage = unitEconomics(base({ model: "brokerage" }));
  assert.ok(r.outputVat > brokerage.outputVat * 9);
});

test("판매자 · 증빙 0% — 부가세·소득세·가산세 세 군데서 샌다", () => {
  const r = unitEconomics(
    base({ model: "reseller", proofPct: 0, incomeTaxPct: 20, penaltyPct: 2 })
  );
  const payout = 150000 - 15000;
  near(r.payout, payout);
  near(r.unrecoveredVat, payout - payout / 1.1); // 매입세액을 하나도 못 받는다
  near(r.disallowedTax, payout * 0.2); // 전액 비용 불인정
  near(r.penalty, payout * 0.02);
  near(r.structureCost, r.unrecoveredVat + r.disallowedTax + r.penalty);

  const brokerage = unitEconomics(base({ model: "brokerage" }));
  near(r.pl, brokerage.pl - r.structureCost);
});

test("면세 작가는 증빙을 줘도 매입세액이 따라오지 않는다", () => {
  // 증빙은 100% 받지만 전부 면세(계산서·원천징수영수증) → 비용 인정은 되고 부가세 공제는 없다
  const r = unitEconomics(
    base({ model: "reseller", proofPct: 100, taxableSharePct: 0 })
  );
  const payout = 150000 - 15000;
  assert.equal(r.payoutInputVat, 0);
  near(r.unrecoveredVat, payout - payout / 1.1);
  assert.equal(r.disallowedTax, 0); // 비용 인정은 된다
  assert.equal(r.penalty, 0);
});

test("판매자 · 증빙 100% 가 전부 세금계산서면 중개 구조와 손익이 같아진다", () => {
  const reseller = unitEconomics(
    base({ model: "reseller", proofPct: 100, taxableSharePct: 100 })
  );
  const brokerage = unitEconomics(base({ model: "brokerage" }));
  assert.equal(reseller.structureCost, 0);
  near(reseller.pl, brokerage.pl);
  // 손익은 같아도 오가는 세금 규모는 훨씬 크다
  assert.ok(reseller.outputVat > brokerage.outputVat);
  near(reseller.vatPerShoot, brokerage.vatPerShoot);
});

test("증빙 수취율이 낮을수록 건당 손익이 단조 감소한다", () => {
  const pls = [100, 75, 50, 25, 0].map(
    (proofPct) => unitEconomics(base({ model: "reseller", proofPct })).pl
  );
  for (let i = 1; i < pls.length; i++) assert.ok(pls[i] < pls[i - 1]);
});

test("손익분기 요율을 넣으면 건당 손익이 0 이 된다", () => {
  for (const vat of [
    { on: false },
    {},
    { feeIncludesVat: false },
    { pgDeductible: false },
    { model: "reseller", proofPct: 0 },
    { model: "reseller", proofPct: 55, taxableSharePct: 40 },
  ] as Partial<VatSettings>[]) {
    const input = { ...base(vat), pgOn: true };
    const { needTake } = unitEconomics(input);
    const at = unitEconomics({ ...input, takePct: needTake });
    near(at.pl, 0, 0.01);
  }
});

test("손익분기 성사율·CPA 를 넣어도 건당 손익이 0 이 된다", () => {
  // 성사율은 100% 를 넘을 수 없으니 손익분기가 범위 안에 드는 조건으로 본다
  const input = { ...base(), pgOn: true, cpa: 4000 };
  const r = unitEconomics(input);
  assert.ok(r.needRate < 100);
  near(unitEconomics({ ...input, ratePct: r.needRate }).pl, 0, 0.01);
  near(unitEconomics({ ...input, cpa: r.needCpa }).pl, 0, 0.01);
});

test("광고비를 공제하지 않으면 청구액 전체가 비용", () => {
  const r = unitEconomics(base({ adDeductible: false }));
  near(r.adSupply, 11529);
  assert.equal(r.adInputVat, 0);
});

test("월 납부세액 — 매출세액에서 광고·PG·콘텐츠 매입세액을 뺀다", () => {
  const unit = unitEconomics({ ...base(), pgOn: true });
  const vat = { ...DEFAULT_VAT };
  const m = monthlyVat({ unit, vat, shoots: 20, inquiries: 60, contentCost: 500000 });

  near(m.contentInputVat, ((500000 * 0.4) / 1.1) * 0.1);
  near(m.contentSupply, 500000 - m.contentInputVat);
  near(m.outputVat, 20 * unit.outputVat);
  near(m.pgInputVat, 20 * unit.pgInputVat);
  near(m.adInputVat, 60 * unit.adInputVat);
  assert.ok(m.pgInputVat > 0, "PG 매입세액이 잡혀야 한다");
  near(m.inputVat, m.adInputVat + m.pgInputVat + m.payoutInputVat + m.contentInputVat);
  near(m.payable, m.outputVat - m.inputVat);
});

test("VAT 를 끄면 월 부가세는 전부 0 이고 콘텐츠 비용도 그대로", () => {
  const vat = { ...DEFAULT_VAT, on: false };
  const unit = unitEconomics(base({ on: false }));
  const m = monthlyVat({ unit, vat, shoots: 20, inquiries: 60, contentCost: 500000 });
  assert.equal(m.contentInputVat, 0);
  assert.equal(m.contentSupply, 500000);
  assert.equal(m.inputVat, 0);
  assert.equal(m.payable, 0);
});
