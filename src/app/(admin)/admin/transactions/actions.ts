"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID = ["pending", "scheduled", "paid", "held"];

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

// 정산 상태 변경 — 운영자 수동 처리 (대기→예정→완료/보류). 완료 시 paid_at 기록.
export async function setSettlementStatus(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!VALID.includes(status)) throw new Error("잘못된 상태");

  const patch: { status: string; paid_at?: string | null } = { status };
  if (status === "paid") patch.paid_at = new Date().toISOString();

  const admin = createAdminClient();
  const { error } = await admin.from("settlements").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/transactions");
}
