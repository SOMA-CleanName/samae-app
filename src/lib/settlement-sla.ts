// 작가 정산 기한 — **전달 알림으로부터 7영업일** (수수료·정산 정책 제3조 2항).
//
// 정책 문구는 "승인 절차 없음" 이지만, 자동 지급으로 가기 전까지는 어드민이 직접 누른다.
// 실제 송금이 KG 상점관리자에서 **수동**이라 완전 자동화가 아직 불가능해서다.
//
// 그래서 **사람이 기한을 지켜야 한다.** 목록에 "언제까지" 가 안 보이면 지킬 수가 없다 —
// 환불은 3영업일 초과를 이미 강조하고 있는데(refundSlaOverdue) 정산만 그 표시가 없었다.
//
// 기산점은 `delivered_at` — 작가가 결과물을 전달했다고 알린 시각이다. 어드민이 확인한
// 시각이 아니다. 운영이 늦게 봤다고 작가의 기한이 늘어나면 안 된다.

import { addBusinessDays, daysUntil } from "./business-days";

/** 전달 알림으로부터 이 영업일 안에 지급한다 (수수료·정산 정책 3조 2항) */
export const SETTLEMENT_SLA_BUSINESS_DAYS = 7;

/** 남은 영업일이 이 수 이하면 화면이 미리 재촉한다 */
export const SETTLEMENT_SOON_DAYS = 2;

export type SettlementSla = {
  /** 언제까지 보내야 하는가 */
  dueAt: Date;
  /** 오늘부터 기한까지 남은 달력일. 음수면 지난 것 */
  daysLeft: number;
  /** 기한을 넘겼는가 */
  overdue: boolean;
  /** 곧 넘긴다 — 미리 눈에 띄어야 한다 */
  soon: boolean;
  /** 목록에 그대로 쓰는 한 줄 */
  label: string;
};

/**
 * 아직 안 보낸 정산의 기한 상태.
 *
 * 이미 보냈거나(`settledAt`) 전달 알림이 없으면 null — 셀 기준이 없거나 셀 이유가 없다.
 */
export function settlementSla(
  deliveredAt: string | null | undefined,
  settledAt: string | null | undefined,
  now: Date = new Date()
): SettlementSla | null {
  if (settledAt) return null;
  if (!deliveredAt) return null;
  const from = new Date(deliveredAt);
  if (isNaN(from.getTime())) return null;

  const dueAt = addBusinessDays(from, SETTLEMENT_SLA_BUSINESS_DAYS);
  const daysLeft = daysUntil(dueAt, now);
  const overdue = daysLeft < 0;
  const soon = !overdue && daysLeft <= SETTLEMENT_SOON_DAYS;

  return {
    dueAt,
    daysLeft,
    overdue,
    soon,
    label: overdue
      ? `지급 기한 ${-daysLeft}일 초과`
      : daysLeft === 0
        ? "오늘까지 지급"
        : `지급까지 ${daysLeft}일`,
  };
}
