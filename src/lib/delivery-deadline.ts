// 결과물 전달 기한 — 회원약관 10조 5항, 작가약관 10조 2항.
//
//   기한 = 촬영일 + 상품에 적은 일수 (안 적었으면 21일). 촬영일 기준이라 날짜(KST)로 센다.
//   연장은 작가가 제안하고 고객이 동의해야 한다. 동의한 값이 bookings.delivery_due_at 을 덮는다.
//   기한을 14일 이상 넘기면 고객은 계약을 해제하고 전액 환불을 요구할 수 있다 (취소환불 10조 2항).
//
// 순수 함수 — 서버·화면·크론이 같은 값을 낸다. delivery-deadline.test.ts 로 고정.

export const DEFAULT_DELIVERY_DAYS = 21;
/** 이 일수 이상 늦으면 고객이 전액 환불을 요구할 수 있다 */
export const OVERDUE_REFUND_DAYS = 14;
export const MIN_DELIVERY_DAYS = 1;
export const MAX_DELIVERY_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

/** KST 그 날의 23:59:59 */
function kstDayEnd(dayIndex: number): Date {
  return new Date((dayIndex + 1) * DAY_MS - KST_OFFSET_MS - 1000);
}

/** 상품 스냅샷에서 전달 일수를 읽는다. 없거나 이상하면 기본 21일 */
export function deliveryDaysOf(packageSnapshot: unknown): number {
  if (!packageSnapshot || typeof packageSnapshot !== "object") return DEFAULT_DELIVERY_DAYS;
  const d = Number((packageSnapshot as { delivery_days?: unknown }).delivery_days);
  if (!Number.isFinite(d) || d < MIN_DELIVERY_DAYS || d > MAX_DELIVERY_DAYS) return DEFAULT_DELIVERY_DAYS;
  return Math.round(d);
}

/**
 * 전달 기한 — 촬영일(KST) + days 일의 23:59:59.
 * 촬영 시각을 모르면 null (시간 미정 예약은 shootDate 로 잡는다).
 */
export function computeDeliveryDueAt(
  shootAt: string | null,
  shootDate: string | null | undefined,
  days: number
): Date | null {
  let shoot: number | null = null;
  if (shootAt) {
    const t = new Date(shootAt).getTime();
    if (!isNaN(t)) shoot = t;
  }
  if (shoot == null && shootDate) {
    const t = new Date(`${shootDate}T12:00:00+09:00`).getTime();
    if (!isNaN(t)) shoot = t;
  }
  if (shoot == null) return null;
  return kstDayEnd(kstDayIndex(shoot) + Math.max(0, Math.round(days)));
}

/** 기한을 며칠 넘겼나 (달력일, KST). 아직 안 넘겼으면 0 이하 */
export function overdueDays(dueAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!dueAt) return null;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (isNaN(due.getTime())) return null;
  return kstDayIndex(now.getTime()) - kstDayIndex(due.getTime());
}

/** 14일 이상 넘겼는가 — 고객이 전액 환불을 요구할 수 있는 상태 */
export function isRefundableOverdue(dueAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  const d = overdueDays(dueAt, now);
  return d != null && d >= OVERDUE_REFUND_DAYS;
}

/** 연장 제안이 유효한가 — 기존 기한보다 뒤여야 하고, 90일을 넘길 수 없다 */
export function isValidExtension(currentDueAt: string | null, proposed: Date, now: Date = new Date()): boolean {
  if (isNaN(proposed.getTime())) return false;
  const cur = currentDueAt ? new Date(currentDueAt).getTime() : now.getTime();
  if (proposed.getTime() <= cur) return false;
  return proposed.getTime() - now.getTime() <= MAX_DELIVERY_DAYS * DAY_MS;
}
