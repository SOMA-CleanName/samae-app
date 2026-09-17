"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

/** 처리 완료 — 실제 조치(환불·날짜 변경)는 거래 화면에서 하고, 여기서는 접수함을 닫는다 */
export async function resolveSupportRequest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id"));
  const note = String(formData.get("note") || "").trim().slice(0, 500) || null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), admin_note: note })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/support");
}

/**
 * 작가 합의 확인 — **환불 실행의 전제.**
 *
 * 환불은 작가 수익이 걸린 일이라 먼저 작가와 이야기해야 한다. 그 대화는 카톡에서 벌어져
 * 시스템 밖에 있으므로, 최소한 "확인했다" 는 사실과 작가가 뭐라고 했는지는 남긴다.
 * 이게 찍히기 전에는 거래 화면의 [환불] 버튼이 잠긴다(서버에서도 막는다).
 *
 * 되돌릴 수 있게 둔다 — 잘못 찍었는데 못 푸는 게 더 위험하다.
 */
export async function ackPhotographerForRefund(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));
  const undo = String(formData.get("undo") || "") === "1";
  const note = String(formData.get("ackNote") || "").trim().slice(0, 500) || null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_requests")
    .update(
      undo
        ? { photographer_ack_at: null, photographer_ack_by: null, photographer_ack_note: null }
        : {
            photographer_ack_at: new Date().toISOString(),
            photographer_ack_by: me.id,
            photographer_ack_note: note,
          }
    )
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/support");
  revalidatePath("/admin/transactions");
}

export async function reopenSupportRequest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("support_requests")
    .update({ status: "open", resolved_at: null })
    .eq("id", id);
  revalidatePath("/admin/support");
}
