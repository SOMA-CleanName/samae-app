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
