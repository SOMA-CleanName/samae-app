// 손익 계산기 — 부가가치세(VAT) 를 반영한 건당·월간 경제성 계산
//
// 세금 없는 계산은 "얼마 남나" 를 과장한다. 수수료에는 매출세액이 붙고,
// 광고비·PG·콘텐츠 비용에 이미 낸 부가세는 매입세액으로 돌려받는다.
// 그래서 손익은 전부 **공급가액(VAT 제외)** 으로 계산하고,
// 실제로 국세청에 낼 돈(납부세액)은 손익과 분리해서 따로 보여준다.
//
// vat.on === false 면 세율을 0 으로 두는 것과 같아, 이 파일의 모든 식은
// VAT 도입 전 계산과 정확히 같은 값을 낸다.

export const VAT_PCT = 10; // 부가가치세 표준세율 (%)

export type VatSettings = {
  /** 부가세 반영 여부 — 끄면 모든 값이 세전(예전) 계산과 같아진다 */
  on: boolean;
  /** 부가세율 (%) */
  pct: number;
  /** 우리 수수료가 VAT 포함 금액인가 — 6,000원을 받으면 그 안에 545원이 세금 */
  feeIncludesVat: boolean;
  /** 광고비 매입세액 공제 여부 — 세금계산서를 받는 매체면 켠다 */
  adDeductible: boolean;
  /** 콘텐츠 월 고정비 중 매입세액 공제가 되는 비중 (%) — 급여·인건비는 공제 대상이 아니다 */
  contentDeductiblePct: number;
  /**
   * 에스크로 총액 인식 — 결제 전액을 우리 매출로 잡는 경우.
   * 켜면 촬영비 전액에 매출세액이 붙고, 작가에게 준 돈은 세금계산서를 받은 만큼만 공제된다.
   */
  grossBilling: boolean;
  /** 작가에게서 세금계산서(또는 현금영수증) 를 받는 비율 (%) — 총액 인식일 때만 쓴다 */
  taxInvoicePct: number;
};

export const DEFAULT_VAT: VatSettings = {
  on: true,
  pct: VAT_PCT,
  feeIncludesVat: true,
  adDeductible: true,
  contentDeductiblePct: 40,
  grossBilling: false,
  taxInvoicePct: 30,
};

export type UnitInput = {
  /** 건당 평균 촬영비 (고객 결제액, VAT 포함) */
  shoot: number;
  /** 우리 수수료율 (%) */
  takePct: number;
  pgOn: boolean;
  /** PG 수수료율 (%) — 결제 전액에 붙는다 */
  pgPct: number;
  /** 문의 후 성사율 (%) */
  ratePct: number;
  /** 문의당 CPA (원, 매체 청구액) */
  cpa: number;
  vat: VatSettings;
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 세율 배수 — VAT 를 끄면 0 */
export function vatRate(vat: VatSettings): number {
  return vat.on ? clamp(vat.pct, 0, 100) / 100 : 0;
}

/** VAT 포함 금액에서 공급가액을 뽑는다 */
export function toSupply(gross: number, v: number): number {
  return gross / (1 + v);
}

/** VAT 포함 금액에 들어 있는 세액 */
export function vatOf(gross: number, v: number): number {
  return gross - toSupply(gross, v);
}

export type UnitResult = {
  v: number;
  /** 청구되는 수수료 (촬영비 × 요율, VAT 포함 표시가) */
  billedFee: number;
  /** 수수료 공급가액 = 실제 매출 */
  feeSupply: number;
  /** 매출세액 (성사 1건당) */
  outputVat: number;

  pgBilled: number;
  pgSupply: number;
  pgInputVat: number;

  /** 순수수료 = 수수료 공급가액 − PG 공급가액 */
  netFee: number;

  /** 작가에게 나가는 정산액 */
  payout: number;
  /** 총액 인식인데 세금계산서를 못 받아 우리가 떠안는 부가세 (건당 비용) */
  unrecoveredVat: number;
  /** 총액 인식에서 실제로 공제되는 정산액 매입세액 */
  payoutInputVat: number;

  /** 문의 1건당 광고비 (청구액 / 공급가액 / 매입세액) */
  adBilled: number;
  adSupply: number;
  adInputVat: number;

  /** 성사당 획득비용 (공급가액 기준) */
  acq: number;
  /** 건당 손익 */
  pl: number;
  positive: boolean;
  /** 회수율 = 순수수료 ÷ 획득비용 */
  roas: number;

  /** 손익분기 성사율 (%) */
  needRate: number;
  /** 손익분기 문의당 CPA (원, 청구액 기준) */
  needCpa: number;
  /** 손익분기 수수료율 (%) */
  needTake: number;

  /** 성사 1건당 순납부세액 (매출세액 − 매입세액) — 손익이 아니라 대신 걷어 내는 돈 */
  vatPerShoot: number;
};

/**
 * 건당 경제성.
 *
 * 손익은 전부 공급가액 기준이다:
 *   순수수료 = 수수료 공급가액 − PG 공급가액
 *   건당 손익 = 순수수료 − 성사당 획득비용 − 미공제 부가세
 */
export function unitEconomics(input: UnitInput): UnitResult {
  const { shoot, pgOn, vat } = input;
  const v = vatRate(vat);
  const takePct = clamp(input.takePct, 0, 100);
  const pgPct = clamp(input.pgPct, 0, 100);
  const rate = clamp(input.ratePct, 1, 100) / 100;

  // 수수료 — 청구가는 그대로, 매출로 잡히는 건 공급가액
  const billedFee = shoot * (takePct / 100);
  const feeIncl = vat.on && vat.feeIncludesVat;
  const feeSupply = feeIncl ? toSupply(billedFee, v) : billedFee;

  // PG 수수료는 결제 전액에 붙고, 세금계산서를 받으므로 매입세액 공제 대상
  const pgBilled = pgOn ? shoot * (pgPct / 100) : 0;
  const pgSupply = toSupply(pgBilled, v);
  const pgInputVat = pgBilled - pgSupply;

  const netFee = feeSupply - pgSupply;

  // 작가 정산액 — 순액 인식이면 우리 장부를 통과만 하므로 세금에 영향이 없다.
  // 총액 인식이면 촬영비 전액이 매출이 되고, 세금계산서를 받은 만큼만 공제된다.
  const payout = Math.max(0, shoot - billedFee);
  const ti = clamp(vat.taxInvoicePct, 0, 100) / 100;
  const payoutVatTotal = vat.on && vat.grossBilling ? vatOf(payout, v) : 0;
  const payoutInputVat = payoutVatTotal * ti;
  const unrecoveredVat = payoutVatTotal * (1 - ti);

  // 광고비
  const adBilled = input.cpa;
  const adDeduct = vat.on && vat.adDeductible;
  const adSupply = adDeduct ? toSupply(adBilled, v) : adBilled;
  const adInputVat = adBilled - adSupply;

  const acq = adSupply / rate;
  const pl = netFee - acq - unrecoveredVat;

  // 손익분기 — 나머지를 고정했을 때 필요한 값
  // pl(t) = shoot·t/100/k − pgSupply − A·(1 − t/100) − acq = 0
  //   k = 수수료 VAT 포함 여부, A = 총액 인식에서 촬영비 전액에 걸린 미공제 부가세 계수
  const k = feeIncl ? 1 + v : 1;
  const A = vat.on && vat.grossBilling ? shoot * (v / (1 + v)) * (1 - ti) : 0;
  const denom = shoot / k + A;
  const needTake = denom > 0 ? (100 * (pgSupply + acq + A)) / denom : Infinity;

  // 순수수료에서 미공제 부가세를 뺀 값이 광고비가 덮어야 할 실제 여력
  const headroom = netFee - unrecoveredVat;
  const needRate = headroom > 0 ? (adSupply / headroom) * 100 : Infinity;
  const needCpa = headroom > 0 ? headroom * rate * (adDeduct ? 1 + v : 1) : 0;

  // 납부세액 — 성사 1건 기준. 매출세액에서 그 건에 딸린 매입세액을 뺀다.
  const outputVat =
    vat.on && vat.grossBilling ? vatOf(shoot, v) : feeIncl ? billedFee - feeSupply : 0;
  const vatPerShoot = outputVat - pgInputVat - payoutInputVat;

  return {
    v,
    billedFee,
    feeSupply,
    outputVat,
    pgBilled,
    pgSupply,
    pgInputVat,
    netFee,
    payout,
    unrecoveredVat,
    payoutInputVat,
    adBilled,
    adSupply,
    adInputVat,
    acq,
    pl,
    positive: pl >= 0,
    roas: acq > 0 ? netFee / acq : Infinity,
    needRate,
    needCpa,
    needTake,
    vatPerShoot,
  };
}

export type MonthlyInput = {
  unit: UnitResult;
  vat: VatSettings;
  /** 월 성사(촬영) 건수 */
  shoots: number;
  /** 월 문의 건수 — 광고비는 성사 여부와 무관하게 문의 전부에 든다 */
  inquiries: number;
  /** 콘텐츠 월 고정비 (청구액) */
  contentCost: number;
};

export type MonthlyVatResult = {
  /** 콘텐츠 고정비 중 공제되는 매입세액 */
  contentInputVat: number;
  /** 손익에 잡히는 콘텐츠 비용 (공급가액 + 공제 못 받은 세액) */
  contentSupply: number;
  outputVat: number;
  inputVat: number;
  /** 납부세액 = 매출세액 − 매입세액. 음수면 환급 */
  payable: number;
};

/** 월 부가세 — 손익과 별개로 국세청에 낼(돌려받을) 돈 */
export function monthlyVat({
  unit,
  vat,
  shoots,
  inquiries,
  contentCost,
}: MonthlyInput): MonthlyVatResult {
  const v = vatRate(vat);
  const share = vat.on ? clamp(vat.contentDeductiblePct, 0, 100) / 100 : 0;
  const contentInputVat = vatOf(contentCost * share, v);
  const contentSupply = contentCost - contentInputVat;

  const outputVat = shoots * unit.outputVat;
  const inputVat =
    shoots * (unit.pgInputVat + unit.payoutInputVat) + inquiries * unit.adInputVat + contentInputVat;

  return { contentInputVat, contentSupply, outputVat, inputVat, payable: outputVat - inputVat };
}
