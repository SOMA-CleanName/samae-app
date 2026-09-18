"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportKind } from "@/lib/support";
import { createSupportRequest } from "@/lib/support-requests";

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
  // 예약이 없는 요청(개인정보·신고)은 계정 성격으로 정한다 — 예약 당사자 확인이 없어서다
  let role: "customer" | "photographer" = me.photographer ? "photographer" : "customer";
  if (bookingId) {
    const { data: b } = await admin
      .from("bookings")
      .select("user_id, photographer_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) throw new Error("예약을 찾을 수 없습니다.");
    // 창구는 고객 전용이다. 작가는 사매와 카톡으로 이어져 있어 여기로 받지 않는다 —
    // 예외는 작가측 촬영 취소(취소환불 8조) 하나. 기록이 남아야 수수료 청구와 이력 집계가 된다.
    // (버튼만 감추면 폼 위조로 들어올 수 있으므로 서버에서도 막는다).
    const amPhotographer = !!me.photographer && me.photographer.id === b.photographer_id;
    if (kind === "photographer_cancel") {
      if (!amPhotographer) throw new Error("이 예약의 작가만 취소를 접수할 수 있어요.");
      role = "photographer";
    } else {
      if (b.user_id !== me.id) throw new Error("이 예약의 고객만 문의할 수 있어요.");
      role = "customer";
    }
  }

  // 취소 신청이면 환불 계좌를 함께 받는다 — 사매 계좌로 이체한 돈을 돌려줄 곳 (취소환불 11조 2항)
  const bank = String(formData.get("refundBank") || "").trim().slice(0, 30);
  const number = String(formData.get("refundNumber") || "").replace(/[^0-9-]/g, "").slice(0, 30);
  const holder = String(formData.get("refundHolder") || "").trim().slice(0, 30);
  const refundAccount = kind === "refund" && bank && number && holder ? { bank, number, holder } : null;

  // 행 삽입·기한 기산·채팅 흔적·운영 알림은 한 덩어리다 — lib/support-requests 가 한다.
  // (QA 가 같은 경로를 탈 수 있어야 해서 액션 밖으로 뺐다)
  await createSupportRequest({
    requesterId: me.id,
    requesterRole: role,
    bookingId,
    conversationId,
    kind,
    body,
    refundAccount,
  });

  if (conversationId) revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/my-inquiries"); // 목록 카드에서 넣은 경우도 즉시 반영
  revalidatePath("/admin/support");
}
