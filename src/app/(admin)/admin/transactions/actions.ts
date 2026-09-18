"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAllAndDeleteMany, deleteBookingsByIds } from "@/lib/soft-delete";
import { verifyResetPassword } from "@/lib/admin-reset";
// 돈이 움직이는 액션은 **누가 했는지 남긴다**(0136). 기록 실패가 본 작업을 막지 않는다.
import { logAdminAction } from "@/lib/admin-audit";

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
  await logAdminAction({
    action: "deposit_confirm",
    actor: { id: me.id, label: me.displayName },
    target: { table: "bookings", id },
  });
  revalidatePath("/admin/transactions");
}

export async function adminMarkSettled(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));
  const res = await markSettlementPaid(id);
  if (!res.ok) throw new Error("처리할 수 없는 상태예요 (결과물 전달 전이거나 이미 정산됨).");
  await logAdminAction({
    action: "settle",
    actor: { id: me.id, label: me.displayName },
    target: { table: "bookings", id },
  });
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

  // 작가 합의가 먼저다 — 환불은 작가 수익이 걸린 일이라 통보가 아니라 합의여야 한다.
  // 버튼만 잠그면 폼을 위조해 들어올 수 있으므로 여기서도 막는다.
  //
  // 고객이 낸 환불 신청이 열려 있을 때만 건다. 운영이 스스로 판단해 실행하는 건
  // (작가 귀책·천재지변·노쇼)은 해당 없다 — 그건 작가와 합의할 성질이 아니다.
  const admin = createAdminClient();
  const { data: openReq } = await admin
    .from("support_requests")
    .select("id, photographer_ack_at")
    .eq("booking_id", id)
    .eq("kind", "refund")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openReq && !openReq.photographer_ack_at && !override) {
    throw new Error(
      "작가와 먼저 합의해야 해요. 접수함(/admin/support)에서 [작가 합의 확인] 을 찍은 뒤 다시 시도하세요."
    );
  }

  const res = await refundBooking(id, {
    override,
    manualRefundKrw,
    note: String(formData.get("note") ?? ""),
  });
  if (!res.ok) throw new Error("환불할 수 없는 상태예요 (이미 환불됐거나 입금 전).");

  // 사유·금액까지 남긴다 — 나중에 답해야 할 질문은 "환불했나" 가 아니라 "왜 그 금액인가" 다
  await logAdminAction({
    action: "refund",
    actor: { id: me.id, label: me.displayName },
    target: { table: "bookings", id },
    detail: {
      override: override ?? "시간 규칙",
      manualRefundKrw,
      note: String(formData.get("note") ?? "") || null,
      photographerAgreed: !!openReq?.photographer_ack_at,
    },
  });
  revalidatePath("/admin/transactions");
}

/**
 * 환불금을 **실제로 보냈다**고 기록한다.
 *
 * `refundBooking()` 은 원장 정리일 뿐 돈을 옮기지 않는다 — 송금은 PG 지급대행에서 따로 한다.
 * 그 둘을 구분해 남기지 않으면 "환불됨" 으로 닫힌 건이 실은 돈이 안 나간 상태일 수 있고,
 * 고객이 항의하기 전에는 아무도 모른다. 3영업일 SLA 가 걸린 자리라 더욱 그렇다.
 */
export async function adminMarkRefundPaid(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ refund_paid_at: new Date().toISOString(), refund_paid_by: me.id })
    .eq("id", id)
    .not("refunded_at", "is", null) // 환불 판정이 끝난 건만
    .is("refund_paid_at", null) // 멱등 — 첫 송금 시각을 유지한다
    .select("id");
  if (!moved || moved.length === 0) {
    throw new Error("처리할 수 없는 상태예요 (환불 처리 전이거나 이미 송금 기록됨).");
  }
  await logAdminAction({
    action: "refund_paid",
    actor: { id: me.id, label: me.displayName },
    target: { table: "bookings", id },
  });
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
 * 정산은 하지 않는다 — 결과물 전달 뒤 정산 대기 큐에서 따로 한다(작가약관 13조 1항).
 */
export async function adminMarkDepositAndConfirm(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id"));

  const marked = await markTransferByOps(id);
  if (!marked.ok) throw new Error("처리할 수 없는 상태예요 (수락 전이거나 이미 입금 표시됨).");

  const confirmed = await confirmBankTransferAdmin(id);
  if (!confirmed.ok) throw new Error("입금 표시는 됐지만 확인에 실패했어요 — 입금 확인 대기에서 다시 시도해주세요.");

  // 고객이 누르지 않은 걸 운영이 대신 눌렀다는 사실이 남아야 한다
  await logAdminAction({
    action: "deposit_confirm",
    actor: { id: me.id, label: me.displayName },
    target: { table: "bookings", id },
    detail: { byOps: true },
  });
  revalidatePath("/admin/transactions");
}

// ── 추가 결제 (booking_extras) — 회원약관 8조 ───────────────────────
import { confirmExtraPaid, refundExtra, settleExtra } from "@/lib/extras-admin";

export async function adminConfirmExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const extraId = String(formData.get("id"));
  const ok = await confirmExtraPaid(extraId);
  if (!ok) throw new Error("처리할 수 없는 상태예요 (수락 전이거나 이미 확인됨).");
  await logAdminAction({
    action: "extra_confirm",
    actor: { id: me.id, label: me.displayName },
    target: { table: "booking_extras", id: extraId },
  });
  revalidatePath("/admin/transactions");
}

export async function adminRefundExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const extraId = String(formData.get("id"));
  const res = await refundExtra(extraId);
  if (!res.ok)
    throw new Error(
      res.reason === "delivered"
        ? "결과물이 전달된 추가금은 환불하지 않아요 (회원약관 8조 3항)."
        : res.reason === "pre_shoot_merged"
          ? "촬영 전 추가금은 예약에 합산돼 있어요 — 예약 환불로 처리하세요."
          : "처리할 수 없는 상태예요."
    );
  await logAdminAction({
    action: "extra_refund",
    actor: { id: me.id, label: me.displayName },
    target: { table: "booking_extras", id: extraId },
  });
  revalidatePath("/admin/transactions");
}

export async function adminSettleExtra(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const extraId = String(formData.get("id"));
  const res = await settleExtra(extraId);
  if (!res.ok) throw new Error("처리할 수 없는 상태예요 (전달 전이거나 이미 정산됨).");
  await logAdminAction({
    action: "extra_settle",
    actor: { id: me.id, label: me.displayName },
    target: { table: "booking_extras", id: extraId },
  });
  revalidatePath("/admin/transactions");
}

/**
 * 사매 입금 계좌 — 고객이 촬영비를 넣는 에스크로 계좌.
 *
 * 「입금·문의 관리」에 있던 것을 여기로 옮겼다(2026-09-19). 리드 모델 시절 그 화면이
 * 돈을 다루던 유일한 곳이어서 거기 있었을 뿐이고, 지금 이 값을 읽는 건 예약 에스크로다.
 *
 * ⚠️ 비면 고객 화면에 입금 안내가 안 떠서 거래가 그 자리에서 멈춘다.
 */
export async function updatePlatformAccount(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_account")
    .update({
      bank: String(formData.get("bank") ?? "").trim(),
      number: String(formData.get("number") ?? "").trim(),
      holder: String(formData.get("holder") ?? "").trim(),
      notice: String(formData.get("notice") ?? "").trim(),
    })
    .eq("id", true);
  if (error) throw new Error(error.message);
  // ⚠️ 계좌번호 전체를 기록에 남기지 않는다 — 기록은 오래 남고 읽는 사람이 는다.
  //    "바뀌었다" 와 "어느 계좌로" 를 구분할 만큼만 남긴다.
  const number = String(formData.get("number") ?? "").trim();
  await logAdminAction({
    action: "platform_account",
    actor: { id: me.id, label: me.displayName },
    detail: {
      bank: String(formData.get("bank") ?? "").trim(),
      holder: String(formData.get("holder") ?? "").trim(),
      numberTail: number.slice(-4),
    },
  });
  revalidatePath("/admin/transactions");
}
