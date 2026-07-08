"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAllAndDeleteMany } from "@/lib/soft-delete";
import { verifyResetPassword } from "@/lib/admin-reset";

const VALID = ["pending", "scheduled", "paid", "held"];

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

export type ResetState = { error?: string; ok?: boolean };

// 거래·정산 전체 초기화 — 소프트딜리트(아카이브 후 제거). 운영자 + 비밀번호.
// 순서 중요: bookings 를 restrict 로 참조하는 테이블 먼저(없는 테이블은 자동 스킵).
// 4개 테이블을 단일 트랜잭션으로 원자 삭제 — 중간 실패 시 전체 롤백(회계 정합성 보장).
export async function clearTransactions(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  const pw = verifyResetPassword(formData.get("password"));
  if (pw.error) return { error: pw.error };

  const { error } = await archiveAllAndDeleteMany(
    ["settlements", "platform_fees", "payments", "bookings"],
    me.id
  );
  if (error) return { error };

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
