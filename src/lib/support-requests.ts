import "server-only";

// 사매 접수 — 요청 한 건이 남을 때 **반드시 같이 일어나야 하는 것들**.
//
// 행을 넣는 것만으로는 부족하다. 환불 신청은 그 순간부터 3영업일 시계가 돌고(전자상거래법
// 18조 2항), 운영이 알아야 작가와 이야기를 시작하고, 상대도 "지금 사매가 보고 있다" 를
// 알아야 기다린다. 그 넷이 한 덩어리다 — 하나라도 빠지면 기한을 넘기거나 분쟁이 된다.
//
// 서버 액션에서 떼어낸 이유: **QA 가 진짜 경로를 타야 해서다.** 액션은 세션이 있어야
// 부를 수 있어서 밖에서 재현할 수 없고, 그러면 알림을 확인하려고 코드를 베끼게 된다.
// 베낀 경로를 테스트하면 진짜 경로는 여전히 확인이 안 된 채로 남는다.

import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORT_KIND_LABEL, type SupportKind } from "@/lib/support";
import { notifyOpsRefundRequested } from "@/lib/ops-alert";

export type RefundAccount = { bank: string; number: string; holder: string };

export async function createSupportRequest(params: {
  requesterId: string;
  requesterRole: "customer" | "photographer";
  bookingId: string | null;
  conversationId: string | null;
  kind: SupportKind;
  body: string;
  refundAccount: RefundAccount | null;
}): Promise<{ id: string }> {
  const admin = createAdminClient();
  const isRefund = params.kind === "refund" || params.kind === "photographer_cancel";

  const { data: inserted, error } = await admin
    .from("support_requests")
    .insert({
      booking_id: params.bookingId,
      conversation_id: params.conversationId,
      requester_id: params.requesterId,
      requester_role: params.requesterRole,
      kind: params.kind,
      body: params.body,
      refund_account: params.refundAccount,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 취소 신청이 들어온 순간이 곧 '취소 시점'(취소환불 5조 3항)이자 환급 기한의 기산점이다 —
  // 위약금 구간은 이 시각으로 판정하고(lib/refund.ts requestedAt), 여기서부터 3영업일 안에
  // 환급해야 한다. 넘기면 연 15% 지연이자가 법정 의무로 붙는다(전자상거래법 제18조 제2항).
  if (isRefund && params.bookingId) {
    await admin
      .from("bookings")
      .update({ refund_due_at: new Date().toISOString() })
      .eq("id", params.bookingId)
      .is("refund_due_at", null); // 첫 요청 시각을 유지 — 재요청으로 시계가 리셋되면 안 된다
  }

  // 채팅에 흔적 — 상대도 "지금 사매가 보고 있다" 를 알아야 기다릴 수 있다
  if (params.conversationId) {
    await admin.from("messages").insert({
      conversation_id: params.conversationId,
      sender_id: params.requesterId,
      type: "system",
      body: `🛟 사매에 ${SUPPORT_KIND_LABEL[params.kind]}이 접수됐어요 — 사매가 확인 후 안내드릴게요.`,
    });
  }

  // 운영에게 알린다 — **접수함에 행만 쌓이면 아무도 모른다.**
  if (isRefund) {
    await notifyOpsRefundRequested({
      bookingId: params.bookingId,
      requestId: inserted.id as string,
      body: params.body,
      byPhotographer: params.kind === "photographer_cancel",
    });
  }

  return { id: inserted.id as string };
}
