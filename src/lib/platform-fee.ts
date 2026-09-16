// 사매 중개 수수료 — 수수료정산정책 1.0.
//
//   수수료 = 촬영 대금 × 20% (부가가치세 별도)
//   촬영 대금 = 촬영비 + 출장비 + 추가금. 회원이 스튜디오 등 제3자에게 직접 내는 돈은 뺀다.
//
// 정액(옛 모델, 6,000원)과 정률이 함께 살아 있다. 정액을 명시적으로 설정한 작가만 정액이고,
// 설정이 비어 있는 작가는 전역 기본(정률 20%)을 따른다.
//
// ⚠️ 화면·정산·환불이 각자 숫자를 읽으면 한 화면만 옛 값으로 남는 사고가 난다.
//    수수료가 필요한 자리는 반드시 resolveFee() 를 거칠 것.
//
// server-only 가 붙지 않은 순수 모듈 — 어드민 클라이언트 화면도 같은 계산을 쓴다.

/** 정액 모드의 기본 금액 (옛 모델) */
export const PLATFORM_FEE_KRW = 6000;

/** 정률 기본 요율 — 수수료정책 1조 */
export const DEFAULT_FEE_RATE = 0.2;

/** 수수료에 붙는 부가가치세율 */
export const FEE_VAT_RATE = 0.1;

/** 요율 허용 범위 — 실수로 0.2(=20%) 대신 20 을 넣는 사고를 DB 제약과 함께 막는다 */
export const MIN_FEE_RATE = 0.01;
export const MAX_FEE_RATE = 0.5;

export type FeeMode = "flat" | "rate";

/** 작가별 수수료 설정 (photographers.fee_*) */
export type FeeSpec = {
  mode: FeeMode;
  /** flat 일 때. null/undefined 면 전역 기본값 */
  amountKrw?: number | null;
  /** rate 일 때. 0.2 = 20% */
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

/** 스냅샷의 요율 — 위약금 배분(작가 80 : 사매 20)에 쓴다. 정액이면 기본 요율 */
export function feeRateOf(snapshot: Pick<FeeSnapshot, "mode" | "rate"> | null | undefined): number {
  if (snapshot?.mode === "rate" && snapshot.rate && snapshot.rate > 0) return snapshot.rate;
  return DEFAULT_FEE_RATE;
}

/** 위약금 배분 — 작가 수익으로 보아 수수료율로 나눈다 (수수료정책 10조) */
export function penaltySplit(
  penaltyKrw: number,
  rate: number = DEFAULT_FEE_RATE
): { companyKrw: number; photographerKrw: number } {
  const penalty = Math.max(0, Math.round(penaltyKrw || 0));
  const companyKrw = Math.round(penalty * rate);
  return { companyKrw, photographerKrw: penalty - companyKrw };
}

/** 작가 사업자 유형 — 수수료정책 1조 2항 */
export type BusinessType = "general" | "simplified" | "unregistered";

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  general: "일반과세자",
  simplified: "간이과세자",
  unregistered: "사업자 미등록",
};

/**
 * 사업자 유형별 실질 부담률 (%). 현금으로 빠지는 건 모두 22%(수수료 20% + 부가세 2%)지만,
 * 일반과세자는 세금계산서로 매입세액을 돌려받아 실질 20% 다.
 */
export function effectiveBurdenPct(type: BusinessType | null | undefined, rate: number = DEFAULT_FEE_RATE): number {
  const gross = rate * 100 * (1 + FEE_VAT_RATE);
  return type === "general" ? rate * 100 : +gross.toFixed(2);
}

/** 사람이 읽는 설정 표기 — "정액 6,000원" / "정률 20%" */
export function feeSpecLabel(spec: FeeSpec): string {
  if (spec.mode === "rate") {
    const rate = spec.rate && spec.rate > 0 ? spec.rate : DEFAULT_FEE_RATE;
    return `정률 ${+(rate * 100).toFixed(2)}%`;
  }
  return `정액 ${new Intl.NumberFormat("ko-KR").format(spec.amountKrw ?? PLATFORM_FEE_KRW)}원`;
}
