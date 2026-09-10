import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VAT,
  PAYOUT_FEE,
  paymentSplit,
  photographerTakes,
  incomeTaxRate,
  INCOME_TAX_BRACKETS,
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
  payoutFee: PAYOUT_FEE,
  vat: { ...DEFAULT_VAT, ...vat },
});

test("VAT 를 끄면 세전 계산과 정확히 같다", () => {
  const r = unitEconomics(base({ on: false }));
  near(r.feeSupply, 15000);
  near(r.netFee, 15000 - PAYOUT_FEE);
  near(r.acq, 11529 / 0.33);
  near(r.pl, 15000 - PAYOUT_FEE - 11529 / 0.33);
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
  near(on.netFee, on.feeSupply - on.pgSupply - PAYOUT_FEE);
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

test("지급대행 수수료 — 건당 정액 550원, 그중 50원은 매입세액 공제", () => {
  const r = unitEconomics(base());
  near(r.payoutFeeSupply, 500);
  near(r.payoutFeeInputVat, 50);
  near(r.payoutFeeBilled, 550);
  // 순수수료에서 공급가액 500원만 빠진다 (50원은 돌려받으니까)
  const none = unitEconomics({ ...base(), payoutFee: 0 });
  near(r.netFee, none.netFee - 500);
});

test("지급대행은 정액이라 촬영비가 쌀수록 비중이 커진다", () => {
  const cheap = unitEconomics({ ...base(), shoot: 50000 });
  const rich = unitEconomics({ ...base(), shoot: 500000 });
  const share = (u: ReturnType<typeof unitEconomics>) => u.payoutFeeSupply / u.feeSupply;
  assert.ok(share(cheap) > share(rich) * 5);
});

test("VAT 를 끄면 지급대행도 500원 그대로 (돌려받을 세액이 없다)", () => {
  const r = unitEconomics(base({ on: false }));
  near(r.payoutFeeSupply, 500);
  near(r.payoutFeeBilled, 500);
  assert.equal(r.payoutFeeInputVat, 0);
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
  near(m.payoutFeeInputVat, 20 * 50);
  near(m.adInputVat, 60 * unit.adInputVat);
  assert.ok(m.pgInputVat > 0, "PG 매입세액이 잡혀야 한다");
  near(
    m.inputVat,
    m.adInputVat + m.pgInputVat + m.payoutFeeInputVat + m.payoutInputVat + m.contentInputVat
  );
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

// ── 고객이 낸 돈의 분배 ────────────────────────────────────────────

const splitOf = (input: UnitInput) => {
  const rows = paymentSplit(input.shoot, unitEconomics(input));
  return Object.fromEntries(rows.map((r) => [r.key, r]));
};

test("분배 합계는 언제나 고객 결제액과 정확히 같다", () => {
  for (const [shoot, patch] of [
    [150000, {}],
    [50000, { on: false }],
    [300000, { model: "reseller" as const, proofPct: 0 }],
    [150000, { model: "reseller" as const, proofPct: 100, taxableSharePct: 100 }],
    [80000, { feeIncludesVat: false }],
  ] as [number, Partial<VatSettings>][]) {
    const input = { ...base(patch), shoot, pgOn: true };
    const rows = paymentSplit(shoot, unitEconomics(input));
    near(
      rows.reduce((a, r) => a + r.amount, 0),
      shoot,
      0.01
    );
    near(
      rows.reduce((a, r) => a + r.pct, 0),
      100,
      0.01
    );
  }
});

test("중개 · PG 없음 — 국세청 몫은 우리 수수료에 붙은 부가세뿐", () => {
  const s = splitOf(base());
  near(s.photographer.amount, 135000); // 촬영비 − 수수료
  near(s.samae.amount, 15000 / 1.1 - PAYOUT_FEE);
  near(s.pg.amount, 0);
  near(s.payoutAgent.amount, PAYOUT_FEE);
  near(s.tax.amount, 15000 - 15000 / 1.1); // 1,364원
  near(s.photographer.pct, 90);
});

test("PG 를 붙여도 국세청 몫은 그대로 — PG 부가세는 공제로 상쇄된다", () => {
  const off = splitOf(base());
  const on = splitOf({ ...base(), pgOn: true });
  near(on.tax.amount, off.tax.amount, 0.01);
  // PG 가 가져가는 만큼 사매 몫이 줄어든다
  near(on.pg.amount, (150000 * 0.033) / 1.1);
  near(on.samae.amount, off.samae.amount - on.pg.amount);
  near(on.photographer.amount, off.photographer.amount);
});

test("부가세를 끄면 국세청 몫이 0 이고 사매가 그만큼 더 가진다", () => {
  const s = splitOf(base({ on: false }));
  assert.equal(s.tax.amount, 0);
  near(s.samae.amount, 15000 - PAYOUT_FEE);
});

test("판매자로 잡히면 국세청 몫이 사매 몫을 앞지른다", () => {
  const s = splitOf(base({ model: "reseller", proofPct: 0 }));
  assert.ok(s.tax.amount > s.samae.amount);
  // 새는 돈이 순수수료보다 커서 사매 몫이 마이너스로 간다
  assert.ok(s.samae.amount < 0);
  near(s.photographer.amount, 135000); // 작가가 받는 돈은 그대로
});

test("촬영비가 쌀수록 지급대행 비중이 커진다", () => {
  const cheap = splitOf({ ...base(), shoot: 50000 });
  const rich = splitOf({ ...base(), shoot: 500000 });
  assert.ok(cheap.payoutAgent.pct > rich.payoutAgent.pct * 5);
});

// ── 작가 유형별 실수령 ──────────────────────────────────────────────

const takesOf = (input: UnitInput) => {
  const u = unitEconomics(input);
  const rows = photographerTakes(u, input.shoot, input.vat);
  return Object.fromEntries(rows.map((r) => [r.key, r]));
};

// 검산 기준: 촬영비 150,000 · 요율 22% → 수수료 33,000(공급가 30,000 + VAT 3,000) · 작가 117,000
const case22 = (patch: Partial<VatSettings> = {}) => ({
  ...base(patch),
  shoot: 150000,
  takePct: 22,
  pgOn: true,
});

test("일반과세자 — 매출세액 13,636 − 수수료 매입세액 3,000 = 10,636 납부", () => {
  const t = takesOf(case22());
  near(t.general.tax, 150000 / 11 - 33000 / 11, 1); // 10,636
  near(t.general.net, 117000 - t.general.tax, 1); // 106,364
});

test("간이과세자 — 기준은 정산액이 아니라 고객이 낸 공급대가 전액", () => {
  const t = takesOf(case22());
  // 150,000 × 30% × 10% = 4,500 − (33,000 × 0.5% = 165) = 4,335
  near(t.simplified.tax, 150000 * 0.3 * 0.1 - 33000 * 0.005, 1);
  near(t.simplified.tax, 4335, 1);
  near(t.simplified.net, 112665, 1);
  near(t.simplified.pct, 75.1, 0.1);
});

test("간이 세액은 정산액 기준으로 잘못 잡던 값과 다르다 — 촬영비가 클수록 벌어진다", () => {
  for (const shoot of [150000, 500000]) {
    const input = { ...case22(), shoot };
    const t = takesOf(input);
    const u = unitEconomics(input);
    const wrong = u.payout * 0.3 * 0.1; // 예전(틀린) 방식
    assert.ok(t.simplified.tax > wrong, "공급대가 기준이 더 크다");
  }
  const gap = (shoot: number) => {
    const input = { ...case22(), shoot };
    const t = takesOf(input);
    return t.simplified.tax - unitEconomics(input).payout * 0.3 * 0.1;
  };
  assert.ok(gap(500000) > gap(150000) * 3, "촬영비가 커지면 오차도 커진다");
});

test("간이과세자는 일반과세자의 약 40% 를 낸다 (30% 가 아니다)", () => {
  const t = takesOf(case22());
  const ratio = t.simplified.tax / t.general.tax;
  assert.ok(ratio > 0.38 && ratio < 0.43, `실제 비율 ${ratio}`);
});

test("프리랜서 원천징수 — 기본은 수입금액 기준(원칙), 토글하면 정산액 기준(관행)", () => {
  const principle = takesOf(case22());
  near(principle.freelancer.tax, 150000 * 0.033); // 4,950
  const practice = takesOf(case22({ withholdingOnPayout: true }));
  near(practice.freelancer.tax, 117000 * 0.033); // 3,861
  assert.ok(principle.freelancer.tax > practice.freelancer.tax);
});

test("실수령 = 정산액 − 세금, 비중은 고객 결제액 기준", () => {
  const input = case22();
  const payout = unitEconomics(input).payout;
  for (const r of Object.values(takesOf(input))) {
    near(r.net, payout - r.tax);
    near(r.pct, (r.net / 150000) * 100);
  }
});

test("세금을 끄면 유형과 무관하게 정산액을 그대로 쥔다", () => {
  const input = case22({ on: false });
  const payout = unitEconomics(input).payout;
  for (const r of Object.values(takesOf(input))) {
    assert.equal(r.tax, 0);
    near(r.net, payout);
  }
});

test("요율을 올리면 세 유형 모두 실수령이 함께 준다", () => {
  const low = takesOf({ ...case22(), takePct: 5 });
  const high = takesOf({ ...case22(), takePct: 25 });
  for (const k of ["general", "simplified", "freelancer"] as const) {
    assert.ok(high[k].net < low[k].net);
  }
});

test("작가 세금을 넘기면 작가 몫에서 국세청으로 옮겨간다 — 합은 그대로", () => {
  const input = case22();
  const u = unitEconomics(input);
  const before = Object.fromEntries(paymentSplit(150000, u).map((r) => [r.key, r.amount]));
  for (const t of photographerTakes(u, 150000, input.vat)) {
    const after = Object.fromEntries(
      paymentSplit(150000, u, t.tax).map((r) => [r.key, r.amount])
    );
    near(after.photographer, before.photographer - t.tax);
    near(after.tax, before.tax + t.tax);
    near(after.samae, before.samae); // 사매·PG·지급대행은 그대로
    near(after.pg, before.pg);
    near(
      paymentSplit(150000, u, t.tax).reduce((a, r) => a + r.amount, 0),
      150000,
      0.01
    );
  }
});

test("거래 전체 부가세 — 일반과세자 작가면 고객이 낸 돈의 1/11 이 국세청行", () => {
  const input = case22();
  const u = unitEconomics(input);
  const general = photographerTakes(u, 150000, input.vat)[0];
  const rows = paymentSplit(150000, u, general.tax);
  const tax = rows.find((r) => r.key === "tax")!;
  near(tax.amount, 150000 / 11, 1); // 13,636원
  near(tax.pct, 9.09, 0.05);
});

// ── 작가 소득세 ─────────────────────────────────────────────────────

const takesWith = (bracket?: number, otherPct = 30, patch: Partial<VatSettings> = {}) => {
  const input = case22(patch);
  const u = unitEconomics(input);
  return Object.fromEntries(
    photographerTakes(u, 150000, input.vat, bracket, otherPct).map((r) => [r.key, r])
  );
};

test("한계세율을 고르면 확정값, 안 고르면 구간 전체 범위", () => {
  const fixed = takesWith(15);
  assert.equal(fixed.general.income.fixed, true);
  near(fixed.general.income.min, fixed.general.income.max);

  const range = takesWith();
  assert.equal(range.general.income.fixed, false);
  assert.ok(range.general.income.min < range.general.income.max);
  assert.equal(range.general.income.minRate, Math.min(...INCOME_TAX_BRACKETS.map((b) => b.rate)));
  assert.equal(range.general.income.maxRate, Math.max(...INCOME_TAX_BRACKETS.map((b) => b.rate)));
});

test("지방소득세 10% 가 얹힌다 — 15% 구간이면 실효 16.5%", () => {
  near(incomeTaxRate(15), 0.165, 0.0001);
  const t = takesWith(15);
  near(t.general.income.min, t.general.income.base * 0.165, 1);
});

test("일반과세자 과세소득 — 부가세 뺀 수입에서 수수료 공급가와 기타경비를 뺀다", () => {
  const t = takesWith(15, 30);
  const revenue = 150000 / 1.1; // 136,364
  near(t.general.income.base, revenue - 30000 - revenue * 0.3, 1); // 65,455
});

test("프리랜서 — 원천징수는 선납이라 소득세에서 차감되고, 낮은 구간이면 환급", () => {
  const low = takesWith(6);
  assert.ok(low.freelancer.income.min < 0, "6% 구간에서는 환급이 나온다");
  const high = takesWith(24);
  assert.ok(high.freelancer.income.min > 0);
  // 차감이 실제로 원천징수액만큼인지
  const base = low.freelancer.income.base;
  near(low.freelancer.income.min, base * incomeTaxRate(6) - 4950, 1);
});

test("최종 실수령 = 정산액 − 부가세/원천징수 − 소득세", () => {
  const t = takesWith(15);
  for (const r of Object.values(t)) {
    near(r.finalMin, r.net - r.income.max);
    near(r.finalMax, r.net - r.income.min);
    near(r.finalMinPct, (r.finalMin / 150000) * 100);
  }
});

test("경비율을 올리면 과세소득과 소득세가 함께 준다", () => {
  const lean = takesWith(24, 10);
  const fat = takesWith(24, 60);
  for (const k of ["general", "simplified", "freelancer"] as const) {
    assert.ok(fat[k].income.base < lean[k].income.base);
    assert.ok(fat[k].income.min < lean[k].income.min);
  }
});

test("세금을 끄면 소득세도 0 이고 최종 실수령이 정산액과 같다", () => {
  const t = takesWith(15, 30, { on: false });
  const payout = unitEconomics(case22({ on: false })).payout;
  for (const r of Object.values(t)) {
    assert.equal(r.income.min, 0);
    near(r.finalMin, payout);
    near(r.finalMax, payout);
  }
});
