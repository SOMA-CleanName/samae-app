// 원천징수 — 사업자 등록이 없는 작가에게 정산할 때 우리가 떼어 대신 신고·납부하는 세금.
//
// ── 우리가 왜 하는가 ────────────────────────────────────────────────
// 소득세법 제127조의 원천징수의무자는 거주자에게 사업소득을 **지급하는 자**다.
// 고객 돈이 사매 계좌에 들어왔다가 사매 계좌에서 작가에게 나가므로, 지급자는 사매다.
// 매출을 수수료만 잡는 것(통신판매중개자)과 충돌하지 않는다 — 매출 인식은 '누구의 거래냐',
// 원천징수는 '누가 돈을 건네냐'로 갈리고, 둘의 기준이 다르다.
//
// ── 세율 (3.3%) ────────────────────────────────────────────────────
//   사업소득세      3.0%  (소득세법 제129조 제1항 제3호 — 인적용역 사업소득)
//   지방소득세      0.3%  (소득세의 10% — 지방세법 제103조의13, 특별징수)
//
// ── 누구에게 ───────────────────────────────────────────────────────
//   unregistered  사업자 미등록 → 원천징수 대상
//   general       일반과세자    → 대상 아님 (세금계산서로 처리)
//   simplified    간이과세자    → 대상 아님 (같은 이유)
//   null          아직 안 받음  → **떼지 않는다.** 근거 없이 떼면 그것도 잘못이고,
//                                 정산 전에 사업자 정보를 받는 것이 정상 흐름이다.
//
// ⚠️ 과세표준은 **예약 대금 전체**다. 수수료를 뺀 실지급액이 아니다.
//    사매는 중개자 포지션이라 작가의 매출이 대금 전액이고 수수료는 작가가 부담하는 비용이다.
//    (사매는 수수료만 매출로 잡는다.) 그 구조에서 작가에게 귀속되는 사업소득은 대금 전액이고,
//    수수료는 지급 단계에서 상계될 뿐이다. 실지급액 기준으로 잡으면 과세표준이 작아져
//    과소징수 추징 대상이 된다.
//    → 세무사 확인 결과 기준이 다르면 WITHHOLDING_BASE 한 줄만 바꾼다.

/** 사업소득세율 */
export const INCOME_TAX_RATE = 0.03;
/** 지방소득세 — 소득세액의 10% */
export const LOCAL_TAX_RATE = 0.1;
/**
 * 소액부징수 (소득세법 제86조) — 원천징수할 소득세가 이 금액 미만이면 징수하지 않는다.
 * 소득세 1,000원은 과세표준 33,334원에 해당한다.
 */
export const MINIMUM_WITHHOLDING_KRW = 1000;

/** 사업자 유형 — photographers.business_type (0112) */
export type BusinessType = "general" | "simplified" | "unregistered";

export type Withholding = {
  /** 과세표준 */
  baseKrw: number;
  /** 사업소득세 (3%) */
  incomeTaxKrw: number;
  /** 지방소득세 (소득세의 10%) */
  localTaxKrw: number;
  /** 실제로 떼는 총액 */
  totalKrw: number;
  /** 왜 이 금액인지 — 화면과 정산 내역서에 그대로 쓴다 */
  reason: string;
};

/** 국고금은 10원 미만을 버린다 (국고금관리법 제47조) */
function cut10(n: number): number {
  return Math.floor(n / 10) * 10;
}

const none = (baseKrw: number, reason: string): Withholding => ({
  baseKrw,
  incomeTaxKrw: 0,
  localTaxKrw: 0,
  totalKrw: 0,
  reason,
});

/**
 * 원천징수액을 계산한다. 부수효과 없음.
 *
 * @param baseKrw       과세표준 — 예약 대금 전체 (위 주석 참고)
 * @param businessType  작가의 사업자 유형. null 이면 아직 안 받은 것 → 떼지 않는다
 */
export function computeWithholding(
  baseKrw: number,
  businessType: BusinessType | null | undefined
): Withholding {
  const base = Math.max(0, Math.round(baseKrw || 0));

  if (businessType === "general" || businessType === "simplified") {
    return none(base, "사업자 등록이 있어 원천징수 대상이 아니에요 (세금계산서로 처리).");
  }
  if (businessType !== "unregistered") {
    // 정보가 없으면 떼지 않는다 — 근거 없는 공제가 되고, 나중에 돌려주기도 번거롭다
    return none(base, "사업자 정보가 아직 등록되지 않아 원천징수 없이 정산해요.");
  }

  const incomeTaxKrw = cut10(base * INCOME_TAX_RATE);
  if (incomeTaxKrw < MINIMUM_WITHHOLDING_KRW) {
    return none(
      base,
      `원천징수세액이 ${MINIMUM_WITHHOLDING_KRW.toLocaleString("ko-KR")}원 미만이라 소액부징수로 떼지 않아요 (소득세법 제86조).`
    );
  }

  const localTaxKrw = cut10(incomeTaxKrw * LOCAL_TAX_RATE);
  return {
    baseKrw: base,
    incomeTaxKrw,
    localTaxKrw,
    totalKrw: incomeTaxKrw + localTaxKrw,
    reason: "사업자 미등록 작가라 사업소득세 3%와 지방소득세 0.3%를 원천징수해요.",
  };
}

/** 원천징수 대상인가 — 주민등록번호를 받아야 하는지 판단할 때도 이걸 쓴다 */
export function isWithholdingTarget(businessType: BusinessType | null | undefined): boolean {
  return businessType === "unregistered";
}
