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
// 고객이 사매 계좌로 입금 → 운영자가 확인(accepted→paid) → 결과물 전달 뒤 수수료·부가세 차감 송금 → 정산 완료 마킹.
import { confirmBankTransferAdmin, markSettlementPaid, markTransferByOps } from "@/lib/payments";

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
  if (!res.ok) throw new Error("처리할 수 없는 상태예요 (결과물 전달 전이거나 이미 정산됨).");
  revalidatePath("/admin/transactions");
}

// ── 환불 (docs/32) ────────────────────────────────────────────
// 판정은 lib/refund.ts 가 하고, 운영은 그 결과를 확인한 뒤 실행만 한다.
// 사람이 은행에서 실제로 돈을 보내고, 이 액션은 원장을 정리한다.
import { refundBooking } from "@/lib/payments";
import { isRefundOverride, type RefundOverride } from "@/lib/refund";

export async function adminRefund(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));

  // 운영 판정 — 없으면 시간 규칙대로
  const raw = String(formData.get("override") ?? "");
  const override: RefundOverride | null = isRefundOverride(raw) ? raw : null;
  // 부분 이행 — 운영이 환불액을 직접 적는다 (취소환불 10조 4항)
  const manualRaw = Number(String(formData.get("manualRefundKrw") ?? "").replace(/[^0-9]/g, ""));
  const manualRefundKrw = override === "partial" && Number.isFinite(manualRaw) ? manualRaw : null;
  if (override === "partial" && manualRefundKrw == null) throw new Error("부분 이행은 환불액을 적어야 해요.");

  const res = await refundBooking(id, {
    override,
    manualRefundKrw,
    note: String(formData.get("note") ?? ""),
  });
  if (!res.ok) throw new Error("환불할 수 없는 상태예요 (이미 환불됐거나 입금 전).");

  revalidatePath("/admin/transactions");
}

/**
 * 고객이 [입금 완료] 를 누르지 않은 건을 운영이 대신 확인·정산한다.
 *
 * 통장에 돈은 들어왔는데 버튼을 안 눌러 거래가 멈추는 일이 실제로 생긴다.
 * 확인 주체는 어차피 사매이므로, 고객의 버튼이 없다고 정산을 막을 이유가 없다.
 * (adminSettleNow 와 같은 자리로 합류한다 — 앞에 '고객 대신 표시' 한 단계만 더 있다)
 */
/**
 * 운영이 고객 대신 입금 표시 + 확인 (고객이 [입금 완료] 를 누르지 않은 건).
 * 정산은 하지 않는다 — 결과물 전달 뒤 정산 대기 큐에서 따로 한다(수수료정책 3조 1항).
 */
export async function adminMarkDepositAndConfirm(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));

  const marked = await markTransferByOps(id);
  if (!marked.ok) throw new Error("처리할 수 없는 상태예요 (수락 전이거나 이미 입금 표시됨).");

  const confirmed = await confirmBankTransferAdmin(id);
  if (!confirmed.ok) throw new Error("입금 표시는 됐지만 확인에 실패했어요 — 입금 확인 대기에서 다시 시도해주세요.");

  revalidatePath("/admin/transactions");
}

// ── 추가 결제 (booking_extras) — 회원약관 8조 ───────────────────────
import { confirmExtraPaid, refundExtra, settleExtra } from "@/lib/extras-admin";

export async function adminConfirmExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const ok = await confirmExtraPaid(String(formData.get("id")));
  if (!ok) throw new Error("처리할 수 없는 상태예요 (수락 전이거나 이미 확인됨).");
  revalidatePath("/admin/transactions");
}

export async function adminRefundExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const res = await refundExtra(String(formData.get("id")));
  if (!res.ok)
    throw new Error(
      res.reason === "delivered"
        ? "결과물이 전달된 추가금은 환불하지 않아요 (회원약관 8조 3항)."
        : res.reason === "pre_shoot_merged"
          ? "촬영 전 추가금은 예약에 합산돼 있어요 — 예약 환불로 처리하세요."
          : "처리할 수 없는 상태예요."
    );
  revalidatePath("/admin/transactions");
}

export async function adminSettleExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const res = await settleExtra(String(formData.get("id")));
  if (!res.ok) throw new Error("처리할 수 없는 상태예요 (전달 전이거나 이미 정산됨).");
  revalidatePath("/admin/transactions");
}
