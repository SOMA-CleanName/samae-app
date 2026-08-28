// 사매 중개 수수료 — 정액과 정률이 **동시에** 살아 있다.
//
// 원래는 전역 정액 6,000원 하나였고, 앞으로는 작가별 정률로 간다. 다만 한날한시에
// 갈아엎지 않는다 — 작가를 한 명씩 옮길 수 있어야 하므로 두 모드가 공존한다.
// 설정이 없는 작가는 전역 기본값(정액 6,000)을 따르므로 아무도 깨지지 않는다.
//
// ⚠️ 화면·정산·환불이 각자 숫자를 읽으면 한 화면만 옛 값으로 남는 사고가 난다.
//    수수료가 필요한 자리는 반드시 resolveFee() 를 거칠 것.
//
// server-only 가 붙지 않은 순수 모듈 — 어드민 클라이언트 화면도 같은 계산을 쓴다.
// 정책 근거: docs/32-refund-policy.md §2

/** 설정이 없는 작가의 기본 수수료 (현행 모델) */
export const PLATFORM_FEE_KRW = 6000;

/** 정률로 전환할 때 제안하는 기본 요율 */
export const DEFAULT_FEE_RATE = 0.1;

/** 요율 허용 범위 — 실수로 0.1(=10%) 대신 10 을 넣는 사고를 DB 제약과 함께 막는다 */
export const MIN_FEE_RATE = 0.01;
export const MAX_FEE_RATE = 0.5;

export type FeeMode = "flat" | "rate";

/** 작가별 수수료 설정 (photographers.fee_*) */
export type FeeSpec = {
  mode: FeeMode;
  /** flat 일 때. null/undefined 면 전역 기본값 */
  amountKrw?: number | null;
  /** rate 일 때. 0.1 = 10% */
  rate?: number | null;
};

/** 예약 건에 굳히는 계산 근거 (bookings.fee_snapshot) */
export type FeeSnapshot = {
  mode: FeeMode;
  amountKrw?: number;
  rate?: number;
  /** 계산에 쓰인 촬영비 (출장비 제외) */
  shootFeeKrw: number;
  /** 그래서 얼마인가 */
  feeKrw: number;
};

/** 설정이 비어 있는 작가의 기본 스펙 */
export const DEFAULT_FEE_SPEC: FeeSpec = { mode: "flat", amountKrw: PLATFORM_FEE_KRW };

/**
 * 수수료 계산.
 *
 * 정률은 **촬영비에만** 붙는다 — 출장비는 작가가 이동에 쓴 실비라 사매 몫이 아니다.
 * 그래서 인자가 총액이 아니라 촬영비다. 호출부에서 `amount − travelFee` 를 넘길 것.
 */
export function resolveFee(spec: FeeSpec | null | undefined, shootFeeKrw: number): FeeSnapshot {
  const shoot = Math.max(0, Math.round(shootFeeKrw || 0));
  const s = spec ?? DEFAULT_FEE_SPEC;

  if (s.mode === "rate") {
    // 요율이 비어 있으면 매출이 0 이 된다 — 설정 사고를 조용히 통과시키지 않고 기본값으로 받는다
    const rate = s.rate && s.rate > 0 ? s.rate : DEFAULT_FEE_RATE;
    return { mode: "rate", rate, shootFeeKrw: shoot, feeKrw: Math.round(shoot * rate) };
  }

  const amount = s.amountKrw ?? PLATFORM_FEE_KRW;
  // 촬영비보다 큰 수수료는 있을 수 없다 (소액 촬영에서 정액이 역전되는 경우)
  const feeKrw = Math.max(0, Math.min(amount, shoot));
  return { mode: "flat", amountKrw: amount, shootFeeKrw: shoot, feeKrw };
}

/** DB row(photographers) → FeeSpec */
export function feeSpecFromRow(
  row: { fee_mode?: string | null; fee_amount_krw?: number | null; fee_rate?: number | null } | null
): FeeSpec {
  if (!row) return DEFAULT_FEE_SPEC;
  return {
    mode: row.fee_mode === "rate" ? "rate" : "flat",
    amountKrw: row.fee_amount_krw ?? null,
    rate: row.fee_rate != null ? Number(row.fee_rate) : null,
  };
}

/** 저장된 스냅샷 읽기 — 형식이 깨져 있어도 화면이 죽지 않게 */
export function readFeeSnapshot(raw: unknown): FeeSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const feeKrw = Number(r.feeKrw);
  if (!Number.isFinite(feeKrw)) return null;
  return {
    mode: r.mode === "rate" ? "rate" : "flat",
    ...(r.amountKrw != null ? { amountKrw: Number(r.amountKrw) } : {}),
    ...(r.rate != null ? { rate: Number(r.rate) } : {}),
    shootFeeKrw: Number(r.shootFeeKrw) || 0,
    feeKrw: Math.max(0, Math.round(feeKrw)),
  };
}

/** 사람이 읽는 설정 표기 — "정액 6,000원" / "정률 10%" */
export function feeSpecLabel(spec: FeeSpec): string {
  if (spec.mode === "rate") {
    const rate = spec.rate && spec.rate > 0 ? spec.rate : DEFAULT_FEE_RATE;
    return `정률 ${+(rate * 100).toFixed(2)}%`;
  }
  return `정액 ${new Intl.NumberFormat("ko-KR").format(spec.amountKrw ?? PLATFORM_FEE_KRW)}원`;
}
