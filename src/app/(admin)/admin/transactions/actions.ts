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

// ── 에스크로 운영 액션 ─────────────────────────────────────────
// 고객이 사매 계좌로 입금 → 운영자가 확인(accepted→paid) → 수수료 차감 송금 후 정산 완료 마킹.
import { confirmBankTransferAdmin, markSettlementPaid } from "@/lib/payments";

export async function adminConfirmTransfer(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));
  const res = await confirmBankTransferAdmin(id);
  if (!res.ok) throw new Error("처리할 수 없는 상태예요 (이미 확인됐거나 수락 전).");
  revalidatePath("/admin/transactions");
}

export async function adminMarkSettled(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));
  const res = await markSettlementPaid(id);
  if (!res.ok) throw new Error("처리할 수 없는 상태예요 (미확정이거나 이미 정산됨).");
  revalidatePath("/admin/transactions");
}

/**
 * 입금 확인 + 작가 정산을 한 번에.
 *
 * 실제 운영은 은행 앱에서 입금을 확인한 그 자리에서 수수료를 떼고 작가에게 보낸다.
 * 확인만 하고 정산을 미루는 경우가 없어서, 버튼 두 개는 클릭만 늘릴 뿐이었다.
 * (정산 실송금은 사람이 하고, 이 버튼은 그걸 기록한다)
 */
export async function adminSettleNow(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));

  const confirmed = await confirmBankTransferAdmin(id);
  if (!confirmed.ok) throw new Error("처리할 수 없는 상태예요 (이미 확인됐거나 수락 전).");

  const settled = await markSettlementPaid(id);
  if (!settled.ok) throw new Error("입금은 확인됐지만 정산 기록에 실패했어요 — 정산 대기에서 다시 시도해주세요.");

  revalidatePath("/admin/transactions");
}

// ── 환불 (docs/32) ────────────────────────────────────────────
// 판정은 lib/refund.ts 가 하고, 운영은 그 결과를 확인한 뒤 실행만 한다.
// 사람이 은행에서 실제로 돈을 보내고, 이 액션은 원장을 정리한다.
import { refundBooking } from "@/lib/payments";
import type { RefundOverride } from "@/lib/refund";

export async function adminRefund(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));

  // 운영 판정 — 없으면 시간 규칙대로
  const raw = String(formData.get("override") ?? "");
  const override: RefundOverride | null =
    raw === "force_majeure" || raw === "photographer_fault" ? raw : null;

  const res = await refundBooking(id, { override, note: String(formData.get("note") ?? "") });
  if (!res.ok) throw new Error("환불할 수 없는 상태예요 (이미 환불됐거나 입금 전).");

  revalidatePath("/admin/transactions");
}
