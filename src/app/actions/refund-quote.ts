"use server";

// 고객이 취소를 신청하기 전에 보는 견적.
//
// 어드민 판정과 고객이 본 금액이 다르면 그 자체가 분쟁이 된다. 그래서 화면용으로 따로
// 계산하지 않고 서버의 quoteRefund() — 즉 refundQuote() — 를 그대로 호출한다.
// 아직 신청 전이므로 취소 시점은 '지금'이다 (신청하면 그 시각이 refund_due_at 에 남는다).

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteRefund } from "@/lib/payments";
import { penaltyStarts } from "@/lib/refund";

export type CustomerRefundQuote = {
  amountKrw: number;
  refundKrw: number;
  penaltyKrw: number;
  percent: number;
  penaltyPct: number;
  reason: string;
  /** 촬영일까지 남은 달력일 */
  daysUntilShoot: number | null;
  /** 위약금 40% 가 시작되는 날 (KST 자정) */
  penalty40StartsAt: string | null;
  /** 위약금 90% 가 시작되는 날 (KST 자정) */
  penalty90StartsAt: string | null;
};

export async function getCustomerRefundQuote(
  bookingId: string
): Promise<CustomerRefundQuote | null> {
  const me = await getCurrentUser();
  if (!me) return null;

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("user_id, shoot_at, shoot_date")
    .eq("id", bookingId)
    .maybeSingle();
  // 남의 예약 금액을 들여다볼 수 있으면 안 된다
  if (!b || b.user_id !== me.id) return null;

  const q = await quoteRefund(bookingId);
  if (!q) return null;

  const starts = penaltyStarts(b.shoot_at, b.shoot_date);
  return {
    amountKrw: q.amountKrw,
    refundKrw: q.refundKrw,
    penaltyKrw: q.penaltyKrw,
    percent: q.percent,
    penaltyPct: q.penaltyPct,
    reason: q.reason,
    daysUntilShoot: q.daysUntilShoot,
    penalty40StartsAt: starts ? starts.at40.toISOString() : null,
    penalty90StartsAt: starts ? starts.at90.toISOString() : null,
  };
}
