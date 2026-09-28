// 사매 중개 수수료 — 작가이용약관 2.0 제12조 (옛 수수료정산정책 1.0 을 흡수).
//
//   수수료 = 촬영 대금 × 18% (부가가치세 별도) — 2026-09-21 신규 입점 작가부터. 그전 입점 작가는 행에 적힌 요율(2026-09-21 기준 실제 작가 15명 전원 10%) 그대로
//   촬영 대금 = 촬영비 + 출장비 + 추가금. 회원이 스튜디오 등 제3자에게 직접 내는 돈은 뺀다.
//
// 정액(옛 모델, 6,000원)과 정률이 함께 살아 있다. 정액을 명시적으로 설정한 작가만 정액이고,
// 설정이 비어 있는 작가는 전역 기본(정률 18%)을 따른다.
//
// ⚠️ 화면·정산·환불이 각자 숫자를 읽으면 한 화면만 옛 값으로 남는 사고가 난다.
//    수수료가 필요한 자리는 반드시 resolveFee() 를 거칠 것.
//
// server-only 가 붙지 않은 순수 모듈 — 어드민 클라이언트 화면도 같은 계산을 쓴다.

/** 정액 모드의 기본 금액 (옛 모델) */
export const PLATFORM_FEE_KRW = 6000;

/**
 * 정률 기본 요율 — 작가약관 12조 1항이 입점 동의서로 넘기는 그 값의 기본치.
 *
 * 2026-09-21 신규 작가 18% 로 결정 (그전 기본값 20% — 실제 작가 15명은 전원 10%, 20% 기본값이 박혀 있던 개발자 계정 2개는 0132 에서 18% 로). DB 기본값(마이그레이션 0132)과 같은 값이어야 한다 —
 * 새 작가 행은 DB 기본값으로 요율이 박히고, 행에 요율이 비어 있을 때만 이 상수로 떨어진다.
 * 이미 입점한 작가는 행에 적힌 요율을 그대로 쓴다. 여기를 바꿔도 그들의 정산은 바뀌지 않는다.
 */
export const DEFAULT_FEE_RATE = 0.18;

/** 수수료에 붙는 부가가치세율 */
export const FEE_VAT_RATE = 0.1;

/** 요율 허용 범위 — 실수로 0.18(=18%) 대신 18 을 넣는 사고를 DB 제약과 함께 막는다 */
export const MIN_FEE_RATE = 0.01;
export const MAX_FEE_RATE = 0.5;

export type FeeMode = "flat" | "rate";

/** 작가별 수수료 설정 (photographers.fee_*) */
export type FeeSpec = {
  mode: FeeMode;
  /** flat 일 때. null/undefined 면 전역 기본값 */
  amountKrw?: number | null;
  /** rate 일 때. 0.18 = 18% */
  rate?: number | null;
};

/** 예약 건에 굳히는 계산 근거 (bookings.fee_snapshot) */
export type FeeSnapshot = {
  mode: FeeMode;
  amountKrw?: number;
  rate?: number;
  /** 계산 기준 금액 — 촬영 대금 전체 (촬영비 + 출장비 + 추가금) */
  baseKrw: number;
  /**
   * @deprecated 옛 스냅샷 호환용. 예전엔 촬영비(출장비 제외)에만 요율을 매겼다.
   * 새 스냅샷에서는 baseKrw 와 같은 값이다.
   */
  shootFeeKrw: number;
  /** 수수료 (부가세 제외) */
  feeKrw: number;
  /** 수수료에 붙는 부가세 */
  vatKrw: number;
};

/** 설정이 비어 있는 작가의 기본 스펙 */
export const DEFAULT_FEE_SPEC: FeeSpec = { mode: "rate", rate: DEFAULT_FEE_RATE };

/** 수수료 부가세 — 원 단위 반올림 */
export function vatOnFee(feeKrw: number): number {
  return Math.round(Math.max(0, feeKrw) * FEE_VAT_RATE);
}

/**
 * 수수료 계산. 기준 금액은 **촬영 대금 전체**다 — 호출부에서 촬영비만 넘기지 말 것.
 */
/**
 * **약관 문서에 적을** 요율. 정액(옛 모델)이면 null —
 * "촬영 대금의 N%" 로 표현할 수 없는 값이라 기본 문구로 둬야 한다.
 *
 * ⚠️ 아래 feeRateOf(snapshot) 와 다르다. 저건 **굳은 예약 건**의 요율을 읽어 금액을
 *    되짚는 용도라 항상 숫자를 돌려준다. 이건 **설정**을 문서 문구로 옮기는 용도다.
 */
/**
 * 요율이 아직 **책정되지 않았는가** — 승인 전에 막아야 할 상태.
 *
 * 운영 흐름은 ① 작가 신청 ② 어드민이 그 작가를 보고 **수수료를 책정** ③ 승인 ④ 작가가
 * 그 요율로 계약서를 읽고 동의하며 입점, 순이다(2026-09-21 확정). 요율 없이 승인하면
 * ④ 에서 작가가 **전역 기본값**을 자기 요율로 알고 동의하게 된다 — 나중에 어드민이 값을
 * 넣으면 **작가가 동의한 숫자와 실제 숫자가 달라진다.**
 *
 * ⚠️ `resolveFee`·`feeRateForDocs` 는 비었을 때 기본값으로 **떨어뜨린다**(매출이 0 이 되는
 *    사고를 막으려고). 그 폴백은 계산이 멈추지 않게 하는 안전장치일 뿐 "책정됐다" 는 뜻이
 *    아니다. 그래서 판정을 따로 둔다.
 */
export function feeNeedsSetup(spec: FeeSpec | null | undefined): boolean {
  // ⚠️ **여기서 DEFAULT_FEE_SPEC 으로 떨어뜨리지 않는다.** 다른 함수들은 계산이 멈추지
  //    않게 기본값을 끼워 넣는데, 그걸 여기서도 하면 "설정이 없다" 가 "기본값으로
  //    설정됐다" 로 뒤집힌다 — 이 함수가 막으려던 바로 그 혼동이다. 없으면 미책정이다.
  if (!spec) return true;
  if (spec.mode === "flat") return spec.amountKrw == null;
  return !(spec.rate && spec.rate > 0);
}

export function feeRateForDocs(spec: FeeSpec | null | undefined): number | null {
  const s = spec ?? DEFAULT_FEE_SPEC;
  if (s.mode !== "rate") return null;
  return s.rate && s.rate > 0 ? s.rate : DEFAULT_FEE_RATE;
}

export function resolveFee(spec: FeeSpec | null | undefined, baseKrw: number): FeeSnapshot {
  const base = Math.max(0, Math.round(baseKrw || 0));
  const s = spec ?? DEFAULT_FEE_SPEC;

  if (s.mode === "rate") {
    // 요율이 비어 있으면 매출이 0 이 된다 — 설정 사고를 조용히 통과시키지 않고 기본값으로 받는다
    const rate = s.rate && s.rate > 0 ? s.rate : DEFAULT_FEE_RATE;
    const feeKrw = Math.round(base * rate);
    return { mode: "rate", rate, baseKrw: base, shootFeeKrw: base, feeKrw, vatKrw: vatOnFee(feeKrw) };
  }

  const amount = s.amountKrw ?? PLATFORM_FEE_KRW;
  // 대금보다 큰 수수료는 있을 수 없다 (소액 촬영에서 정액이 역전되는 경우)
  const feeKrw = Math.max(0, Math.min(amount, base));
  return { mode: "flat", amountKrw: amount, baseKrw: base, shootFeeKrw: base, feeKrw, vatKrw: vatOnFee(feeKrw) };
}

/** 수수료 + 부가세 — 정산에서 실제로 빠지는 금액 */
export function feeWithVat(snapshot: Pick<FeeSnapshot, "feeKrw" | "vatKrw">): number {
  return snapshot.feeKrw + snapshot.vatKrw;
}

/** DB row(photographers) → FeeSpec */
export function feeSpecFromRow(
  row: { fee_mode?: string | null; fee_amount_krw?: number | null; fee_rate?: number | null } | null
): FeeSpec {
  if (!row) return DEFAULT_FEE_SPEC;
  return {
    mode: row.fee_mode === "flat" ? "flat" : "rate",
    amountKrw: row.fee_amount_krw ?? null,
    rate: row.fee_rate != null ? Number(row.fee_rate) : null,
  };
}

/**
 * 저장된 스냅샷 읽기 — 형식이 깨져 있어도 화면이 죽지 않게.
 * 옛 스냅샷(baseKrw·vatKrw 없음)은 shootFeeKrw 를 기준으로 보고 부가세를 계산해 채운다.
 * 옛 예약의 수수료 금액(feeKrw)은 그대로 둔다 — 정산·환불이 소급되면 안 된다.
 */
export function readFeeSnapshot(raw: unknown): FeeSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const feeKrw = Number(r.feeKrw);
  if (!Number.isFinite(feeKrw)) return null;
  const fee = Math.max(0, Math.round(feeKrw));
  const base = Number(r.baseKrw ?? r.shootFeeKrw) || 0;
  const vat = Number.isFinite(Number(r.vatKrw)) ? Math.max(0, Math.round(Number(r.vatKrw))) : vatOnFee(fee);
  return {
    mode: r.mode === "flat" ? "flat" : "rate",
    ...(r.amountKrw != null ? { amountKrw: Number(r.amountKrw) } : {}),
    ...(r.rate != null ? { rate: Number(r.rate) } : {}),
    baseKrw: base,
    shootFeeKrw: Number(r.shootFeeKrw) || base,
    feeKrw: fee,
    vatKrw: vat,
  };
}

/** 스냅샷의 요율 — 위약금 배분(작가 100−요율 : 사매 요율)에 쓴다. 정액이면 기본 요율 */
export function feeRateOf(snapshot: Pick<FeeSnapshot, "mode" | "rate"> | null | undefined): number {
  if (snapshot?.mode === "rate" && snapshot.rate && snapshot.rate > 0) return snapshot.rate;
  return DEFAULT_FEE_RATE;
}

/**
 * 위약금 배분 — 작가 수익으로 보아 수수료율로 나눈다 (작가약관 16조 1항).
 *
 * ⚠️ **부가세도 뺀다.** 16조 1항이 "촬영 대금과 동일하게 중개 수수료를 공제한 금액" 이라 하고
 *    12조 1항이 "부가가치세는 별도" 라 한다. 촬영비 정산은 수수료+부가세를 빼는데 여기만
 *    안 빼고 있었다(2026-09-18 점검). 판정의 진실은 refund.ts 이고 여기는 같은 셈을 쓴다.
 */
export function penaltySplit(
  penaltyKrw: number,
  rate: number = DEFAULT_FEE_RATE
): { companyKrw: number; vatKrw: number; photographerKrw: number } {
  const penalty = Math.max(0, Math.round(penaltyKrw || 0));
  const companyKrw = Math.round(penalty * rate);
  const vatKrw = vatOnFee(companyKrw);
  return { companyKrw, vatKrw, photographerKrw: penalty - companyKrw - vatKrw };
}

/** 작가 사업자 유형 — 작가약관 14조 2항(증빙)·입점 동의서 3항(실질 부담) */
export type BusinessType = "general" | "simplified" | "unregistered";

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  general: "일반과세자",
  simplified: "간이과세자",
  unregistered: "사업자 미등록",
};

/**
 * 사업자 유형별 실질 부담률 (%). 현금으로 빠지는 건 모두 요율 × 1.1(수수료 + 부가세, 기본 18% → 19.8%)지만,
 * 일반과세자는 세금계산서로 매입세액을 돌려받아 실질 요율 그대로다.
 */
export function effectiveBurdenPct(type: BusinessType | null | undefined, rate: number = DEFAULT_FEE_RATE): number {
  const gross = rate * 100 * (1 + FEE_VAT_RATE);
  return type === "general" ? rate * 100 : +gross.toFixed(2);
}

/** 사람이 읽는 설정 표기 — "정액 6,000원" / "정률 18%" */
export function feeSpecLabel(spec: FeeSpec): string {
  if (spec.mode === "rate") {
    const rate = spec.rate && spec.rate > 0 ? spec.rate : DEFAULT_FEE_RATE;
    return `정률 ${+(rate * 100).toFixed(2)}%`;
  }
  return `정액 ${new Intl.NumberFormat("ko-KR").format(spec.amountKrw ?? PLATFORM_FEE_KRW)}원`;
}
