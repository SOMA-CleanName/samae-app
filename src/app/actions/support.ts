"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportKind, SUPPORT_KIND_LABEL } from "@/lib/support";

/**
 * 사매 문의 접수.
 *
 * 환불·날짜 변경은 작가가 결정할 수 있는 일이 아니다(docs/32). 채팅에서 작가에게 말하면
 * 작가가 규정 밖의 약속을 해버리므로, 요청을 운영 접수함으로 직접 흘려보낸다.
 * 대신 채팅에도 흔적을 남긴다 — 상대가 "말도 없이 취소됐다" 고 느끼지 않게.
 */
export async function submitSupportRequest(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const bookingId = String(formData.get("bookingId") || "") || null;
  const conversationId = String(formData.get("conversationId") || "") || null;
  const kindRaw = formData.get("kind");
  const kind = isSupportKind(kindRaw) ? kindRaw : "other";
  const body = String(formData.get("body") || "").trim().slice(0, 1000);
  if (!body) throw new Error("문의 내용을 적어주세요.");

  const admin = createAdminClient();

  // 요청자가 이 예약의 당사자인지 확인 — 남의 예약에 문의를 붙일 수 없게
  let role: "customer" | "photographer" = "customer";
  if (bookingId) {
    const { data: b } = await admin
      .from("bookings")
      .select("user_id, photographer_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) throw new Error("예약을 찾을 수 없습니다.");
    // 창구는 고객 전용이다. 작가는 사매와 카톡으로 이어져 있어 여기로 받지 않는다
    // (버튼만 감추면 폼 위조로 들어올 수 있으므로 서버에서도 막는다).
    if (b.user_id !== me.id) throw new Error("이 예약의 고객만 문의할 수 있어요.");
    role = "customer";
  }

  const { error } = await admin.from("support_requests").insert({
    booking_id: bookingId,
    conversation_id: conversationId,
    requester_id: me.id,
    requester_role: role,
    kind,
    body,
  });
  if (error) throw new Error(error.message);

  // 환불 요청이 들어온 순간이 곧 '사유 확정일' 이다 — 여기서부터 3영업일 안에 환급해야 하고,
  // 넘기면 연 15% 지연이자가 법정 의무로 붙는다(전자상거래법 제18조 제2항).
  // 수동 처리라 주말이 끼면 그냥 넘어가므로, 기산 시각을 남겨 어드민이 볼 수 있게 한다.
  if (kind === "refund" && bookingId) {
    await admin
      .from("bookings")
      .update({ refund_due_at: new Date().toISOString() })
      .eq("id", bookingId)
      .is("refund_due_at", null); // 첫 요청 시각을 유지 — 재요청으로 시계가 리셋되면 안 된다
  }

  // 채팅에 흔적 — 상대도 "지금 사매가 보고 있다" 를 알아야 기다릴 수 있다
  if (conversationId) {
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: me.id,
      type: "system",
      body: `🛟 사매에 ${SUPPORT_KIND_LABEL[kind]}이 접수됐어요 — 사매가 확인 후 안내드릴게요.`,
    });
  }

  if (conversationId) revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/my-inquiries"); // 목록 카드에서 넣은 경우도 즉시 반영
}
