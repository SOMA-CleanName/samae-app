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

test("순액 인식이면 작가 정산액은 세금에 영향이 없다", () => {
  const r = unitEconomics(base({ grossBilling: false, taxInvoicePct: 0 }));
  assert.equal(r.unrecoveredVat, 0);
  assert.equal(r.payoutInputVat, 0);
});

test("총액 인식 + 세금계산서 0% 면 정산액 부가세를 통째로 우리가 떠안는다", () => {
  const r = unitEconomics(base({ grossBilling: true, taxInvoicePct: 0 }));
  const payout = 150000 - 15000;
  near(r.payout, payout);
  near(r.unrecoveredVat, payout - payout / 1.1);
  // 그 금액만큼 건당 손익이 깎인다
  const netOnly = unitEconomics(base({ grossBilling: false }));
  near(r.pl, netOnly.pl - r.unrecoveredVat);
});

test("총액 인식 + 세금계산서 100% 면 순액 인식과 손익이 같다", () => {
  const gross = unitEconomics(base({ grossBilling: true, taxInvoicePct: 100 }));
  const net = unitEconomics(base({ grossBilling: false }));
  near(gross.pl, net.pl);
  // 다만 매출세액·매입세액 규모는 총액 인식 쪽이 훨씬 크다
  assert.ok(gross.outputVat > net.outputVat);
  near(gross.vatPerShoot, net.vatPerShoot);
});

test("손익분기 요율을 넣으면 건당 손익이 0 이 된다", () => {
  for (const vat of [
    { on: false },
    {},
    { grossBilling: true, taxInvoicePct: 0 },
    { grossBilling: true, taxInvoicePct: 55 },
    { feeIncludesVat: false },
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
  near(m.inputVat, 20 * unit.pgInputVat + 60 * unit.adInputVat + m.contentInputVat);
  near(m.payable, m.outputVat - m.inputVat);
});

test("VAT 를 끄면 월 부가세는 전부 0 이고 콘텐츠 비용도 그대로", () => {
  const vat = { ...DEFAULT_VAT, on: false };
  const unit = unitEconomics(base({ on: false }));
  const m = monthlyVat({ unit, vat, shoots: 20, inquiries: 60, contentCost: 500000 });
  assert.equal(m.contentInputVat, 0);
  assert.equal(m.contentSupply, 500000);
  assert.equal(m.payable, 0);
});
