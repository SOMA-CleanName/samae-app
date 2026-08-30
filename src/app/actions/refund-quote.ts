"use server";

// 고객이 환불을 요청하기 전에 보는 견적 (docs/32 §6-6).
//
// 어드민 판정과 고객이 본 금액이 다르면 그 자체가 분쟁이 된다. 그래서 화면용으로 따로
// 계산하지 않고 서버의 quoteRefund() — 즉 refundQuote() — 를 그대로 호출한다.

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteRefund } from "@/lib/payments";
import { penaltyStart } from "@/lib/refund";

export type CustomerRefundQuote = {
  amountKrw: number;
  refundKrw: number;
  penaltyKrw: number;
  percent: number;
  reason: string;
  /** 촬영 7일 전 — 이 날부터 환불이 사라진다 */
  penaltyStartsAt: string | null;
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

  const start = penaltyStart(b.shoot_at, b.shoot_date);
  return {
    amountKrw: q.amountKrw,
    refundKrw: q.refundKrw,
    penaltyKrw: Math.max(0, q.amountKrw - q.refundKrw),
    percent: q.percent,
    reason: q.reason,
    penaltyStartsAt: start ? start.toISOString() : null,
  };
}
