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

  /**
   * 프리랜서 원천징수를 무엇에 매기는가.
   * true  = 정산액 기준 — 우리가 보내는 돈에만 뗀다 (플랫폼 실무 관행)
   * false = 수입금액 기준 — 작가의 수입 전액에 뗀다 (세법 원칙, 지급명세서도 이 금액)
   */
  withholdingOnPayout: boolean;
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
  withholdingOnPayout: false,
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

/** 고객이 낸 돈이 나뉘어 가는 곳 */
export type SplitKey = "photographer" | "samae" | "pg" | "payoutAgent" | "tax";

export type SplitRow = {
  key: SplitKey;
  label: string;
  /** 금액 (원) */
  amount: number;
  /** 고객 결제액 대비 비중 (%) */
  pct: number;
};

/**
 * 고객이 낸 촬영비 전액이 누구에게 얼마씩 가는가.
 *
 * 항등식: 촬영비 = 작가 + 사매 + PG사 + 지급대행사 + 국세청
 *
 * PG·지급대행은 **공급가액**만 그들의 몫으로 잡는다 — 청구액에 붙은 부가세는
 * 그들이 국세청에 내고 우리가 매입세액으로 공제받으므로, 최종 귀속처는 국세청이다.
 * 같은 이유로 국세청 몫은 나머지를 뺀 잔액으로 구한다 — 어떤 설정에서도 합이 100% 가 되고,
 * 판매자 인정 시나리오에서 새는 소득세·가산세까지 자동으로 여기에 잡힌다.
 *
 * 작가 몫은 우리가 보내는 금액 그대로다. 그 안에서 작가가 낼 세금은 작가 사정이라
 * (과세사업자면 1/11 이 부가세) 여기서는 나누지 않는다 — 단, 총액 인식이라
 * 우리가 작가에게서 세금계산서를 받는 몫은 국세청으로 넘어간 게 확인되므로 뺀다.
 */
export function paymentSplit(
  shoot: number,
  u: UnitResult,
  /**
   * 작가가 자기 몫에서 낼 세금. 넘기면 그만큼 작가 몫에서 빼 국세청으로 옮긴다.
   * 0 이면 "우리가 보내는 금액" 기준 — 작가 세금은 작가 몫 안에 남는다.
   */
  photographerTax = 0
): SplitRow[] {
  const photographer = Math.max(0, u.payout - u.payoutInputVat - photographerTax);
  const samae = u.netFee - u.structureCost;
  const pg = u.pgSupply;
  const payoutAgent = u.payoutFeeSupply;
  // 국세청은 잔액 — 작가 세금을 넘기면 자동으로 여기에 합쳐진다
  const tax = shoot - photographer - samae - pg - payoutAgent;

  const rows: Array<[SplitKey, string, number]> = [
    ["photographer", photographerTax > 0 ? "작가 (세후 실수령)" : "작가", photographer],
    ["samae", "사매", samae],
    ["pg", "PG사", pg],
    ["payoutAgent", "지급대행사", payoutAgent],
    ["tax", photographerTax > 0 ? "국세청 (거래 전체 세금)" : "국세청 (사매 라인 부가세)", tax],
  ];
  return rows.map(([key, label, amount]) => ({
    key,
    label,
    amount,
    pct: shoot > 0 ? (amount / shoot) * 100 : 0,
  }));
}

// ── 작가가 실제로 손에 쥐는 돈 ──────────────────────────────────────
//
// 우리가 보내는 정산액과 작가의 실수령은 다르다. 사업자 유형에 따라
// 세금이 붙는 방식 자체가 달라서, 같은 금액을 보내도 남는 게 제각각이다.

/**
 * 간이과세 업종별 부가가치율 (%).
 * "인물사진 및 행사용 영상 촬영업" 은 전문·과학·기술서비스업(40%)에서 명시적으로 제외돼
 * 30% 구간이다 — 사매 작가는 거의 여기에 해당한다.
 */
export const SIMPLIFIED_VALUE_ADDED_RATE = 30;
/** 간이과세자 세금계산서등 수취 세액공제 (%) — 매입액의 0.5% */
export const SIMPLIFIED_CREDIT_PCT = 0.5;
/** 프리랜서(인적용역) 원천징수율 (%) — 소득세 3% + 지방소득세 0.3% */
export const WITHHOLDING_PCT = 3.3;
/** 간이과세자 부가세 납부의무 면제 기준 (연 매출, 원) */
export const SIMPLIFIED_EXEMPT_REVENUE = 48_000_000;

export type PhotographerType = "general" | "simplified" | "freelancer";

export type PhotographerTake = {
  key: PhotographerType;
  label: string;
  /** 정산액에서 빠지는 세금 */
  tax: number;
  /** 작가가 실제로 쥐는 돈 */
  net: number;
  /** 고객 결제액 대비 실수령 비중 (%) */
  pct: number;
  /** 무슨 세금인지 */
  taxLabel: string;
  note: string;

  /** 이 건이 늘리는 소득세 (지방소득세 포함) — 연 소득에 따라 달라 범위일 수 있다 */
  income: IncomeTaxEstimate;
  /** 부가세·원천징수에 소득세까지 뺀 최종 실수령 (범위) */
  finalMin: number;
  finalMax: number;
  /** 최종 실수령의 고객 결제액 대비 비중 (%) */
  finalMinPct: number;
  finalMaxPct: number;
};

/**
 * 촬영 1건에서 작가가 실제로 쥐는 돈.
 *
 * 핵심: **부가세도 원천징수도 우리가 보내는 정산액이 아니라 고객이 낸 금액을 기준으로 매긴다.**
 * 작가가 고객에게 판 값은 촬영비 전액이고, 우리 수수료는 작가 입장에서 매출 차감이 아니라
 * 비용이기 때문이다. 정산액 기준으로 잡으면 촬영비가 커질수록 오차가 벌어진다.
 *
 * - 일반과세자: 매출세액(촬영비의 1/11) − 우리가 끊어준 수수료 세금계산서의 매입세액.
 *   (장비·스튜디오 등 다른 매입은 작가마다 달라 빼지 않는다 — 실제로는 이보다 덜 낸다)
 * - 간이과세자: 공급대가(촬영비 전액) × 부가가치율 × 세율 − 매입액 × 0.5% 세액공제.
 *   연 매출 4,800만원 미만이면 납부의무 자체가 면제.
 * - 프리랜서: 부가세가 없는 대신 원천징수. 기준은 설정에 따라 수입금액(원칙) 또는 정산액(관행).
 *
 * 소득세·종합소득세는 작가의 연간 소득 전체로 정해지므로 건당으로 나누지 않는다.
 */
export function photographerTakes(
  u: UnitResult,
  shoot: number,
  vat: VatSettings,
  /** 작가의 연 과세표준 구간 세율 (%). 모르면 undefined → 범위로 낸다 */
  bracketPct?: number,
  /** 장비·이동·보정 등 우리가 알 수 없는 경비 비율 (수입금액 대비 %) */
  otherExpensePct = 30
): PhotographerTake[] {
  const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
  const v = vatRate(vat);
  const payout = u.payout;
  const vaRate = (clamp(SIMPLIFIED_VALUE_ADDED_RATE, 0, 100) / 100) * v;
  const credit = vat.on ? clamp(SIMPLIFIED_CREDIT_PCT, 0, 100) / 100 : 0;
  const withholding = vat.on ? clamp(WITHHOLDING_PCT, 0, 100) / 100 : 0;

  // 일반과세자 — 촬영비 전액의 매출세액에서 우리 수수료의 매입세액을 뺀다
  const generalTax = Math.max(0, vatOf(shoot, v) - vatOf(u.billedFee, v));

  // 간이과세자 — 기준은 정산액이 아니라 고객이 낸 공급대가 전액
  const simplifiedTax = Math.max(0, shoot * vaRate - u.billedFee * credit);

  // 프리랜서 — 원천징수 기준을 설정에서 고른다
  const withholdingBase = vat.withholdingOnPayout ? payout : shoot;
  const freelancerTax = withholdingBase * withholding;

  const ratio = generalTax > 0 ? (simplifiedTax / generalTax) * 100 : 0;

  const rows: Array<[PhotographerType, string, number, string, string]> = [
    [
      "general",
      "일반과세자",
      generalTax,
      `부가세 ${vat.on ? vat.pct : 0}%`,
      `촬영비 전액의 매출세액 ${won(vatOf(shoot, v))} 에서, 우리가 끊어준 수수료 세금계산서의 매입세액 ${won(vatOf(u.billedFee, v))} 을 공제받아 뺀 금액이에요 — 위 분배표의 국세청 몫에 잡힌 그 돈을 이 작가는 돌려받습니다. 장비·스튜디오 매입까지 공제하면 실제로는 이보다 덜 내요. 소득세는 별도.`,
    ],
    [
      "simplified",
      "간이과세자",
      simplifiedTax,
      `부가세 (부가가치율 ${SIMPLIFIED_VALUE_ADDED_RATE}%)`,
      `기준은 정산액이 아니라 고객이 낸 ${Math.round(shoot).toLocaleString("ko-KR")}원 전액이에요 — 우리 수수료는 작가의 비용이지 매출 차감이 아니니까요. 여기에 매입액 ${SIMPLIFIED_CREDIT_PCT}% 세액공제를 뺐습니다. 일반과세자의 약 ${ratio.toFixed(0)}% 수준이고, 연 매출 ${(SIMPLIFIED_EXEMPT_REVENUE / 10000).toLocaleString("ko-KR")}만원 미만이면 납부 면제.`,
    ],
    [
      "freelancer",
      "프리랜서 (사업자 미등록)",
      freelancerTax,
      `원천징수 ${vat.on ? WITHHOLDING_PCT : 0}%`,
      vat.withholdingOnPayout
        ? "정산액 기준으로 뗍니다 — 플랫폼 실무에서 흔한 방식이지만, 세무서가 보는 원칙은 수입금액 기준이에요. 지급명세서에 올라갈 금액과 어긋날 수 있습니다. 연말 종합소득세로 정산하며, 환급이 아니라 추가 납부가 될 수도 있어요."
        : "작가의 수입금액(촬영비 전액) 기준으로 뗍니다 — 세법 원칙이고 지급명세서에도 이 금액이 올라가요. 연말 종합소득세로 정산하는데, 다른 소득이 있거나 경비율이 낮으면 환급이 아니라 추가 납부가 될 수도 있습니다.",
    ],
  ];

  return rows.map(([key, label, tax, taxLabel, note]) => {
    const net = payout - tax;
    // 프리랜서 원천징수는 소득세 선납이라, 소득세에서 다시 빼면 이중이 된다
    const prepaid = key === "freelancer" ? tax : 0;
    const { revenue, expense } = incomeTaxBasis(
      key,
      shoot,
      u,
      vat,
      key === "freelancer" ? 0 : tax,
      otherExpensePct
    );
    const raw = vat.on ? incomeTaxOfJob(revenue, expense, bracketPct) : incomeTaxOfJob(0, 0, 0);
    // 이미 뗀 원천징수만큼은 낼 소득세에서 차감된다 (음수면 환급)
    const income: IncomeTaxEstimate = {
      ...raw,
      min: raw.min - prepaid,
      max: raw.max - prepaid,
    };
    const finalMax = net - income.min; // 세금이 적으면 많이 남는다
    const finalMin = net - income.max;
    return {
      key,
      label,
      tax,
      net,
      pct: shoot > 0 ? (net / shoot) * 100 : 0,
      taxLabel,
      note,
      income,
      finalMin,
      finalMax,
      finalMinPct: shoot > 0 ? (finalMin / shoot) * 100 : 0,
      finalMaxPct: shoot > 0 ? (finalMax / shoot) * 100 : 0,
    };
  });
}

// ── 작가의 소득세 ──────────────────────────────────────────────────
//
// 부가세와 달리 소득세는 건당으로 확정되지 않는다. 세율이 작가의 **연간 과세표준**
// 으로 정해지기 때문에, 같은 촬영이라도 누가 찍었느냐에 따라 세금이 달라진다.
// 그래서 한계세율을 고르면 확정값을, 안 고르면 구간 전체의 범위를 낸다.

/** 종합소득세 과세표준 구간별 세율 (%) */
export const INCOME_TAX_BRACKETS: Array<{ upTo: number; rate: number; label: string }> = [
  { upTo: 14_000_000, rate: 6, label: "1,400만 이하" },
  { upTo: 50_000_000, rate: 15, label: "~5,000만" },
  { upTo: 88_000_000, rate: 24, label: "~8,800만" },
  { upTo: 150_000_000, rate: 35, label: "~1.5억" },
  { upTo: 300_000_000, rate: 38, label: "~3억" },
  { upTo: 500_000_000, rate: 40, label: "~5억" },
  { upTo: 1_000_000_000, rate: 42, label: "~10억" },
  { upTo: Infinity, rate: 45, label: "10억 초과" },
];
/** 지방소득세 — 소득세의 10% 가 따라붙는다 */
export const LOCAL_INCOME_TAX_PCT = 10;

/** 소득세 + 지방소득세 실효 배수 (예: 15% 구간이면 16.5%) */
export function incomeTaxRate(bracketPct: number): number {
  return (bracketPct / 100) * (1 + LOCAL_INCOME_TAX_PCT / 100);
}

export type IncomeTaxEstimate = {
  /** 이 촬영이 작가의 과세표준에 더하는 금액 (수입 − 경비) */
  base: number;
  /** 세금 하한·상한 (지방소득세 포함) */
  min: number;
  max: number;
  /** 적용된 구간 세율 (%) */
  minRate: number;
  maxRate: number;
  /** 한계세율을 골라 확정된 값인가 */
  fixed: boolean;
};

/**
 * 이 촬영 1건이 작가의 소득세를 얼마나 늘리는가.
 *
 * 한계세율로 계산한다 — 이미 다른 소득이 있는 작가에게 이 건이 얹히는 세금이므로,
 * 누진공제를 다시 빼면 이중으로 빼는 셈이 된다.
 *
 * @param bracketPct 알고 있으면 구간 세율(%), 모르면 undefined → 전 구간 범위
 */
export function incomeTaxOfJob(
  revenue: number,
  expense: number,
  bracketPct?: number
): IncomeTaxEstimate {
  const base = Math.max(0, revenue - expense);
  if (bracketPct !== undefined) {
    const tax = base * incomeTaxRate(bracketPct);
    return { base, min: tax, max: tax, minRate: bracketPct, maxRate: bracketPct, fixed: true };
  }
  const rates = INCOME_TAX_BRACKETS.map((b) => b.rate);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  return {
    base,
    min: base * incomeTaxRate(lo),
    max: base * incomeTaxRate(hi),
    minRate: lo,
    maxRate: hi,
    fixed: false,
  };
}

/**
 * 유형별 소득세 계산의 재료 — 수입금액과 경비는 유형마다 기준이 다르다.
 *
 * - 일반과세자: 부가세를 뺀 공급가액이 수입금액. 우리 수수료도 공급가액만 경비.
 * - 간이과세자: 매입세액 공제가 사실상 없어 부가세 포함 금액이 그대로 경비가 된다.
 *   수입금액은 공급대가에서 납부한 부가세를 뺀 값으로 본다.
 * - 프리랜서: 면세라 부가세가 없다. 받은 돈 전액이 수입금액이고 수수료도 전액이 경비.
 *
 * `otherExpensePct` 는 장비·이동·보정처럼 우리가 알 수 없는 경비의 비율(수입금액 대비).
 */
export function incomeTaxBasis(
  key: PhotographerType,
  shoot: number,
  u: UnitResult,
  vat: VatSettings,
  vatPaid: number,
  otherExpensePct: number
): { revenue: number; expense: number } {
  const v = vatRate(vat);
  const other = clamp(otherExpensePct, 0, 100) / 100;

  let revenue: number;
  let feeExpense: number;
  if (key === "general") {
    revenue = toSupply(shoot, v);
    feeExpense = toSupply(u.billedFee, v);
  } else if (key === "simplified") {
    revenue = shoot - vatPaid;
    feeExpense = u.billedFee;
  } else {
    revenue = shoot;
    feeExpense = u.billedFee;
  }
  return { revenue, expense: feeExpense + revenue * other };
}
