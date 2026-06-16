"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID = ["pending", "scheduled", "paid", "held"];
const RESET_PASSWORD = "same123!";

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

export type ResetState = { error?: string; ok?: boolean };

// 거래·정산 전체 초기화 — 운영자 + 비밀번호.
// bookings 를 참조하는 restrict 테이블(settlements·payments·platform_fees)을 먼저 삭제.
export async function clearTransactions(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  if (String(formData.get("password") ?? "") !== RESET_PASSWORD) return { error: "비밀번호가 올바르지 않아요." };

  const admin = createAdminClient();
  // 순서 중요: restrict FK 먼저
  for (const t of ["settlements", "platform_fees", "payments"]) {
    const { error } = await admin.from(t).delete().not("id", "is", null);
    if (error) return { error: `${t}: ${error.message}` };
  }
  const { error } = await admin.from("bookings").delete().not("id", "is", null);
  if (error) return { error: `bookings: ${error.message}` };

  revalidatePath("/admin/transactions");
  return { ok: true };
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
