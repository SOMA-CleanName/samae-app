"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { archiveAllAndDeleteMany, deleteBookingsByIds } from "@/lib/soft-delete";
import { verifyResetPassword } from "@/lib/admin-reset";

export type ResetState = { error?: string; ok?: boolean };

// 거래 전체 초기화 — 소프트딜리트(아카이브 후 제거). 운영자 + 비밀번호.
// 순서 중요: bookings 를 restrict 로 참조하는 자식(platform_fees·payments) 먼저.
// 단일 트랜잭션으로 원자 삭제 — 중간 실패 시 전체 롤백(회계 정합성 보장).
export async function clearTransactions(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  const pw = verifyResetPassword(formData.get("password"));
  if (pw.error) return { error: pw.error };

  const { error } = await archiveAllAndDeleteMany(["platform_fees", "payments", "bookings"], me.id);
  if (error) return { error };

  revalidatePath("/admin/transactions");
  return { ok: true };
}

// 선택한 거래(booking)만 삭제 — 연관 payments·platform_fees 포함(단일 트랜잭션).
export async function deleteBookingsSelected(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  const pw = verifyResetPassword(formData.get("password"));
  if (pw.error) return { error: pw.error };

  const ids = parseIds(formData.get("ids"));
  if (ids.length === 0) return { error: "선택된 거래가 없어요." };

  const { error } = await deleteBookingsByIds(ids, me.id);
  if (error) return { error };
  revalidatePath("/admin/transactions");
  return { ok: true };
}

// FormData 의 ids(JSON 문자열 배열) 파싱 — 안전하게 문자열 배열로.
function parseIds(raw: FormDataEntryValue | null): string[] {
  try {
    const arr = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
