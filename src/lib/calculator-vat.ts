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
export const PROOF_PENALTY_PCT = 2; // 정규증빙 미수취 가산세 (%)
/** 지급대행 수수료 — 작가에게 정산금을 보낼 때마다 건당 정액으로 나간다 (공급가액, VAT 포함 550원) */
export const PAYOUT_FEE = 500;

/**
 * 세무상 우리가 무엇을 판 것으로 잡히는가 — 이 계산기에서 가장 큰 갈림길.
 *
 * - brokerage(중개): 우리가 판 것은 **수수료**다. 촬영은 작가가 고객에게 판 것이라
 *   우리 매출은 수수료뿐이고, 작가에게서 받을 증빙은 애초에 없다.
 *   세금계산서는 반대 방향으로 한 장만 흐른다 — 사매가 작가에게 수수료분을 발행한다.
 *   (과세 작가는 그걸로 매입세액 공제, 면세 작가는 받아도 쓰지 못한다)
 *
 * - reseller(판매자): 국세청이 우리를 중개자가 아니라 판매자로 볼 때.
 *   PG 가맹이 사매 단독 명의라 카드매출 전액이 사매 사업자로 잡히면,
 *   우리가 촬영을 팔고 작가에게서 사 온 것이 된다. 그러면 작가 지급액을 비용으로
 *   인정받기 위해 적격증빙(세금계산서·계산서·원천징수영수증)이 필요해진다.
 */
export type BillingModel = "brokerage" | "reseller";

export type VatSettings = {
  /** 부가세 반영 여부 — 끄면 모든 값이 세전(예전) 계산과 같아진다 */
  on: boolean;
  /** 부가세율 (%) */
  pct: number;
  /** 우리 수수료가 VAT 포함 금액인가 — 6,000원을 받으면 그 안에 545원이 세금 */
  feeIncludesVat: boolean;
  /** 광고비 매입세액 공제 여부 — 세금계산서를 받는 매체면 켠다 */
  adDeductible: boolean;
  /** PG 수수료 매입세액 공제 여부 — 국내 PG 는 세금계산서를 주므로 보통 켠다 */
  pgDeductible: boolean;
  /** 콘텐츠 월 고정비 중 매입세액 공제가 되는 비중 (%) — 급여·인건비는 공제 대상이 아니다 */
  contentDeductiblePct: number;

  /** 세무상 구조 — 중개(수수료 매출) 인가, 판매자(총액 매출) 인가 */
  model: BillingModel;

  // 아래 넷은 reseller 일 때만 쓴다. 중개 구조에서는 존재하지 않는 지표다.
  /** 작가 지급액 중 적격증빙(세금계산서·계산서·원천징수영수증) 을 받는 비율 (%) */
  proofPct: number;
  /** 받은 증빙 중 **세금계산서**(과세사업자 작가) 비중 (%) — 여기까지만 매입세액 공제가 된다 */
  taxableSharePct: number;
  /** 소득세·법인세 실효세율 (%) — 비용으로 인정 못 받으면 그만큼 과세표준이 부푼다 */
  incomeTaxPct: number;
  /** 정규증빙 미수취 가산세 (%) */
  penaltyPct: number;
};

export const DEFAULT_VAT: VatSettings = {
  on: true,
  pct: VAT_PCT,
  feeIncludesVat: true,
  adDeductible: true,
  pgDeductible: true,
  contentDeductiblePct: 40,
  model: "brokerage",
  proofPct: 30,
  taxableSharePct: 20,
  incomeTaxPct: 20,
  penaltyPct: PROOF_PENALTY_PCT,
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
  /** 지급대행 수수료 (원, 건당 정액 · 공급가액) — 촬영 1건마다 무조건 나간다 */
  payoutFee: number;
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

  /** 지급대행 수수료 — 청구액(VAT 포함) / 공급가액 / 매입세액 */
  payoutFeeBilled: number;
  payoutFeeSupply: number;
  payoutFeeInputVat: number;

  /** 순수수료 = 수수료 공급가액 − PG − 지급대행 수수료 */
  netFee: number;

  /** 작가에게 나가는 정산액 */
  payout: number;
  /** 판매자로 잡혔을 때 실제로 공제되는 정산액 매입세액 (세금계산서 받은 몫) */
  payoutInputVat: number;
  /** 세금계산서를 못 받아 우리가 떠안는 부가세 */
  unrecoveredVat: number;
  /** 증빙이 없어 비용 인정을 못 받아 더 내는 소득세·법인세 */
  disallowedTax: number;
  /** 정규증빙 미수취 가산세 */
  penalty: number;
  /** 판매자로 잡혔을 때 건당 추가로 새는 돈 = 위 셋의 합 */
  structureCost: number;

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

  // PG 수수료는 결제 전액에 붙는다. 세금계산서를 받으면 매입세액을 공제받아
  // 실제 비용은 공급가액만 남고, 못 받으면 청구액 전체가 비용이다.
  const pgBilled = pgOn ? shoot * (pgPct / 100) : 0;
  const pgDeduct = vat.on && vat.pgDeductible;
  const pgSupply = pgDeduct ? toSupply(pgBilled, v) : pgBilled;
  const pgInputVat = pgBilled - pgSupply;

  // 지급대행 수수료 — 정률이 아니라 건당 정액이라, 촬영비가 쌀수록 비중이 커진다.
  // 국내 지급대행사는 세금계산서를 주므로 매입세액은 공제된다.
  const payoutFeeSupply = Math.max(0, input.payoutFee);
  const payoutFeeInputVat = payoutFeeSupply * v;
  const payoutFeeBilled = payoutFeeSupply + payoutFeeInputVat;

  const netFee = feeSupply - pgSupply - payoutFeeSupply;

  // 작가 정산액.
  //
  // 중개 구조면 이 돈은 우리 장부를 통과만 한다 — 작가가 고객에게 판 값이라
  // 우리가 작가에게서 받을 증빙은 없고, 세금에도 영향이 없다.
  //
  // 판매자로 잡히면 이야기가 완전히 달라진다. 촬영비 전액이 우리 매출이 되고,
  // 작가 지급액은 적격증빙을 받은 만큼만 비용으로 인정된다. 못 받으면 세 군데서 샌다:
  //   1) 매입세액 공제 불가 (세금계산서를 받은 몫만 공제된다 — 면세 작가에겐 애초에 없다)
  //   2) 비용 불인정 → 과세표준이 부풀어 소득세·법인세를 더 낸다
  //   3) 정규증빙 미수취 가산세
  const payout = Math.max(0, shoot - billedFee);
  const reseller = vat.on && vat.model === "reseller";
  const proof = clamp(vat.proofPct, 0, 100) / 100;
  const taxableShare = clamp(vat.taxableSharePct, 0, 100) / 100;
  const inc = clamp(vat.incomeTaxPct, 0, 100) / 100;
  const pen = clamp(vat.penaltyPct, 0, 100) / 100;

  // 세금계산서를 받은 몫(= 적격증빙 중 과세사업자 비중)만 매입세액이 따라온다
  const deductibleShare = proof * taxableShare;
  const payoutVatTotal = reseller ? vatOf(payout, v) : 0;
  const payoutInputVat = payoutVatTotal * deductibleShare;
  const unrecoveredVat = payoutVatTotal * (1 - deductibleShare);
  const unproven = reseller ? payout * (1 - proof) : 0; // 증빙이 없는 지급액
  const disallowedTax = unproven * inc;
  const penalty = unproven * pen;
  const structureCost = unrecoveredVat + disallowedTax + penalty;

  // 광고비
  const adBilled = input.cpa;
  const adDeduct = vat.on && vat.adDeductible;
  const adSupply = adDeduct ? toSupply(adBilled, v) : adBilled;
  const adInputVat = adBilled - adSupply;

  const acq = adSupply / rate;
  const pl = netFee - acq - structureCost;

  // 손익분기 — 나머지를 고정했을 때 필요한 값
  // pl(t) = shoot·t/100/k − pgSupply − A·(1 − t/100) − acq = 0
  //   k = 수수료 VAT 포함 여부
  //   A = 판매자로 잡혔을 때 촬영비 전액에 걸리는 구조 비용 계수 (요율이 오르면 정산액이 줄어 함께 준다)
  const k = feeIncl ? 1 + v : 1;
  const A = reseller
    ? shoot * ((v / (1 + v)) * (1 - deductibleShare) + (1 - proof) * (inc + pen))
    : 0;
  const denom = shoot / k + A;
  const needTake = denom > 0 ? (100 * (pgSupply + payoutFeeSupply + acq + A)) / denom : Infinity;

  // 순수수료에서 구조 비용을 뺀 값이 광고비가 덮어야 할 실제 여력
  const headroom = netFee - structureCost;
  const needRate = headroom > 0 ? (adSupply / headroom) * 100 : Infinity;
  const needCpa = headroom > 0 ? headroom * rate * (adDeduct ? 1 + v : 1) : 0;

  // 납부세액 — 성사 1건 기준. 매출세액에서 그 건에 딸린 매입세액을 뺀다.
  const outputVat = reseller ? vatOf(shoot, v) : feeIncl ? billedFee - feeSupply : 0;
  const vatPerShoot = outputVat - pgInputVat - payoutFeeInputVat - payoutInputVat;

  return {
    v,
    billedFee,
    feeSupply,
    outputVat,
    pgBilled,
    pgSupply,
    pgInputVat,
    payoutFeeBilled,
    payoutFeeSupply,
    payoutFeeInputVat,
    netFee,
    payout,
    payoutInputVat,
    unrecoveredVat,
    disallowedTax,
    penalty,
    structureCost,
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
  /** 광고비에서 돌려받는 매입세액 */
  adInputVat: number;
  /** PG 수수료에서 돌려받는 매입세액 */
  pgInputVat: number;
  /** 지급대행 수수료에서 돌려받는 매입세액 */
  payoutFeeInputVat: number;
  /** 작가 정산액에서 돌려받는 매입세액 (총액 인식일 때만) */
  payoutInputVat: number;
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

  const adInputVat = inquiries * unit.adInputVat;
  const pgInputVat = shoots * unit.pgInputVat;
  const payoutFeeInputVat = shoots * unit.payoutFeeInputVat;
  const payoutInputVat = shoots * unit.payoutInputVat;

  const outputVat = shoots * unit.outputVat;
  const inputVat =
    adInputVat + pgInputVat + payoutFeeInputVat + payoutInputVat + contentInputVat;

  return {
    contentInputVat,
    contentSupply,
    adInputVat,
    pgInputVat,
    payoutFeeInputVat,
    payoutInputVat,
    outputVat,
    inputVat,
    payable: outputVat - inputVat,
  };
}
